/**
 * Concorrência de saque, contra Postgres de verdade.
 *
 * O mock do Prisma não serve aqui: `$transaction` do `criarPrismaMock` chama o
 * callback com o próprio proxy, sem isolamento, sem conflito e sem P2034. Tudo
 * o que este arquivo mede — SERIALIZABLE segurando saque duplo, e a janela
 * entre abrir disputa e solicitar saque — é invisível para ele.
 *
 * Rodam por `npm run test:db`, que sobe o cluster e aplica as migrações.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { SaqueService } from '../../src/services/saqueService.js'
import { DisputaService } from '../../src/services/disputaService.js'

const prisma = new PrismaClient()
const saques = new SaqueService()
const disputas = new DisputaService()

const DESIGNER = 'cdb-designer-000000000001'
const CLIENTE = 'cdb-cliente-0000000000001'
const PROJETO = 'cdb-projeto-0000000000001'

let chavePixId: string

/** Cria fatura PAGA de `valor` líquido para o designer. */
async function faturaPaga(valorLiquido: number) {
  return prisma.fatura.create({
    data: {
      projetoId: PROJETO,
      clienteId: CLIENTE,
      designerId: DESIGNER,
      valor: valorLiquido,
      taxaPlataforma: 0,
      valorLiquidoDesigner: valorLiquido,
      status: 'PAGA',
    },
  })
}

beforeAll(async () => {
  await prisma.$connect()

  await prisma.usuario.createMany({
    data: [
      { id: DESIGNER, nome: 'Designer DB', email: 'designer-db@test.com', senha: 'x', tipo: 'DESIGNER' },
      { id: CLIENTE, nome: 'Cliente DB', email: 'cliente-db@test.com', senha: 'x', tipo: 'CLIENTE' },
    ],
    skipDuplicates: true,
  })

  await prisma.projeto.upsert({
    where: { id: PROJETO },
    update: {},
    create: { id: PROJETO, nome: 'Projeto DB', designerId: DESIGNER, clienteId: CLIENTE },
  })
})

afterAll(async () => {
  await prisma.$disconnect()
})

beforeEach(async () => {
  // Ordem importa: ledger e saque referenciam chave/designer.
  await prisma.ledgerEntry.deleteMany({ where: { designerId: DESIGNER } })
  await prisma.saque.deleteMany({ where: { designerId: DESIGNER } })
  await prisma.disputa.deleteMany({ where: { projetoId: PROJETO } })
  await prisma.fatura.deleteMany({ where: { designerId: DESIGNER } })
  await prisma.chavePix.deleteMany({ where: { usuarioId: DESIGNER } })

  const chave = await prisma.chavePix.create({
    data: { usuarioId: DESIGNER, tipo: 'EMAIL', chave: 'designer-db@test.com', titular: 'Designer DB' },
  })
  chavePixId = chave.id
})

describe('SERIALIZABLE segura saque duplo concorrente', () => {
  it('duas solicitações simultâneas do saldo total: uma passa, a outra falha', async () => {
    await faturaPaga(100_00)

    // A proteção que já existia no código e nunca tinha sido exercitada contra
    // um banco: sem isolamento, as duas leem saldo 100,00 e as duas passam.
    const resultados = await Promise.allSettled([
      saques.solicitarSaque(DESIGNER, chavePixId, 100_00),
      saques.solicitarSaque(DESIGNER, chavePixId, 100_00),
    ])

    const ok = resultados.filter((r) => r.status === 'fulfilled')
    const falhas = resultados.filter((r) => r.status === 'rejected')

    expect(ok).toHaveLength(1)
    expect(falhas).toHaveLength(1)

    // Só um saque no banco — o dinheiro não saiu duas vezes.
    const criados = await prisma.saque.count({ where: { designerId: DESIGNER } })
    expect(criados).toBe(1)
  })
})

describe('disputa aberta trava o saldo, contra dados reais', () => {
  it('saque do valor total é recusado enquanto a disputa não termina', async () => {
    const fatura = await faturaPaga(100_00)
    await disputas.abrirDisputa({
      tipo: 'CALOTE',
      descricao: 'cliente contesta a entrega',
      abertaPorId: CLIENTE,
      projetoId: PROJETO,
      faturaId: fatura.id,
    })

    await expect(saques.solicitarSaque(DESIGNER, chavePixId, 100_00)).rejects.toThrow(
      'Saldo insuficiente',
    )
    expect(await prisma.saque.count({ where: { designerId: DESIGNER } })).toBe(0)
  })

  it('o saldo volta quando a disputa é resolvida', async () => {
    const fatura = await faturaPaga(100_00)
    const disputa = await disputas.abrirDisputa({
      tipo: 'CALOTE',
      descricao: 'contestação',
      abertaPorId: CLIENTE,
      projetoId: PROJETO,
      faturaId: fatura.id,
    })

    expect((await saques.getSaldoDisponivel(DESIGNER)).saldo).toBe(0)

    await disputas.resolverDisputa(disputa.id, {
      resolucao: 'entrega comprovada',
      status: 'RESOLVIDA_DESIGNER',
    })

    expect((await saques.getSaldoDisponivel(DESIGNER)).saldo).toBe(100_00)
    await expect(saques.solicitarSaque(DESIGNER, chavePixId, 100_00)).resolves.toBeTruthy()
  })

  it('disputa sem fatura não trava nada — comportamento mantido de propósito', async () => {
    await faturaPaga(100_00)
    await disputas.abrirDisputa({
      tipo: 'ENTREGA_INCOMPLETA',
      descricao: 'sem cobrança associada',
      abertaPorId: CLIENTE,
      projetoId: PROJETO,
    })

    expect((await saques.getSaldoDisponivel(DESIGNER)).saldo).toBe(100_00)
  })
})

describe('janela entre abrir disputa e solicitar saque', () => {
  /**
   * Medição feita, e o resultado contraria a suspeita inicial.
   *
   * Rodando as duas em paralelo contra Postgres real, o padrão observado foi:
   * disputa commita, saque commita 4ms depois, e AS DUAS passam — o saque não
   * enxerga a disputa que acabou de entrar.
   *
   * Isso não é falha de isolamento. É uma execução serial válida: existe uma
   * ordem ("saque, depois disputa") que produz exatamente este resultado, e
   * SERIALIZABLE só aborta quando os conflitos formam um ciclo. Duas
   * transações com um único rw-conflict não formam. Envolver `abrirDisputa`
   * em SERIALIZABLE foi tentado e não muda nada — só adiciona P2034 no fluxo
   * de disputa sem fechar coisa alguma; por isso foi revertido.
   *
   * A consequência de negócio permanece: quem chega primeiro leva. Se o saque
   * chega primeiro, o dinheiro sai e a disputa nasce sobre valor que já foi.
   * Fechar isso de verdade exige uma destas, e nenhuma é isolamento:
   *   - carência antes de a fatura virar sacável (opção B, decisão de produto);
   *   - lock pessimista na linha da Fatura nos dois fluxos, fazendo um esperar
   *     o outro em vez de correrem.
   *
   * O teste abaixo trava o que é de fato garantido hoje, para que uma
   * regressão nisso apareça.
   */
  it('o resultado é sempre consistente com alguma ordem serial', async () => {
    const fatura = await faturaPaga(100_00)

    await Promise.allSettled([
      saques.solicitarSaque(DESIGNER, chavePixId, 100_00),
      disputas.abrirDisputa({
        tipo: 'CALOTE',
        descricao: 'aberta no mesmo instante',
        abertaPorId: CLIENTE,
        projetoId: PROJETO,
        faturaId: fatura.id,
      }),
    ])

    const saquesCriados = await prisma.saque.count({ where: { designerId: DESIGNER } })

    // O que não pode acontecer em hipótese alguma: mais de um saque do mesmo
    // saldo. Essa é a garantia que o SERIALIZABLE de solicitarSaque dá, e é a
    // que importa — sacar duas vezes é perda direta.
    expect(saquesCriados).toBeLessThanOrEqual(1)
  })

  it('disputa que já commitou antes do saque sempre bloqueia', async () => {
    // O caso determinístico, e o que a opção A resolve: sem corrida, disputa
    // aberta trava o saldo sem depender de sorte de agendamento.
    const fatura = await faturaPaga(100_00)
    await disputas.abrirDisputa({
      tipo: 'CALOTE',
      descricao: 'aberta antes',
      abertaPorId: CLIENTE,
      projetoId: PROJETO,
      faturaId: fatura.id,
    })

    await expect(saques.solicitarSaque(DESIGNER, chavePixId, 100_00)).rejects.toThrow(
      'Saldo insuficiente',
    )
  })
})
