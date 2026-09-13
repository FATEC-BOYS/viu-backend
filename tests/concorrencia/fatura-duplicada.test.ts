/**
 * Uma fatura ativa por projeto, contra Postgres de verdade.
 *
 * Os testes em `tests/services/faturaDuplicada.test.ts` rodam sobre o mock do
 * Prisma e provam a metade da aplicação: que a violação do índice vira recusa
 * de negócio em vez de erro de servidor. O que eles não podem provar é a
 * garantia em si — o mock não tem índice, não tem unicidade e não tem duas
 * conexões disputando a mesma linha. Ele aceitaria as duas inserções em
 * silêncio.
 *
 * E é exatamente essa a afirmação do commit que criou o índice: que a checagem
 * no código não garante nada, porque entre o `findFirst` e o `create` cabe
 * outra requisição inteira. Afirmação sobre concorrência precisa de banco.
 *
 * Rodam por `npm run test:db`, que sobe o cluster e aplica as migrações.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { FaturaService } from '../../src/services/faturaService.js'

const prisma = new PrismaClient()
const faturas = new FaturaService()

const DESIGNER = 'cdb-designer-fatura-0001'
const CLIENTE = 'cdb-cliente-fatura-00001'
const PROJETO = 'cdb-projeto-fatura-00001'

const ORCAMENTO = 1_000_00

beforeAll(async () => {
  await prisma.$connect()

  await prisma.usuario.createMany({
    data: [
      { id: DESIGNER, nome: 'Designer Fatura', email: 'designer-fatura@test.com', senha: 'x', tipo: 'DESIGNER' },
      { id: CLIENTE, nome: 'Cliente Fatura', email: 'cliente-fatura@test.com', senha: 'x', tipo: 'CLIENTE' },
    ],
    skipDuplicates: true,
  })

  await prisma.projeto.upsert({
    where: { id: PROJETO },
    update: { orcamento: ORCAMENTO },
    create: {
      id: PROJETO,
      nome: 'Projeto Fatura',
      designerId: DESIGNER,
      clienteId: CLIENTE,
      orcamento: ORCAMENTO,
    },
  })
})

afterAll(async () => {
  await prisma.$disconnect()
})

beforeEach(async () => {
  await prisma.fatura.deleteMany({ where: { projetoId: PROJETO } })
})

describe('duas requisições simultâneas do mesmo projeto', () => {
  it('uma cria a fatura, a outra é recusada — nunca as duas', async () => {
    /*
     * O clique duplo real: o botão dispara, a resposta demora, a pessoa clica
     * de novo. As duas chamadas passam pelo `findFirst` antes de qualquer
     * `create` acontecer, então as duas leem "não existe fatura".
     */
    const resultados = await Promise.allSettled([
      faturas.criarFatura(PROJETO, DESIGNER),
      faturas.criarFatura(PROJETO, DESIGNER),
    ])

    const criadas = resultados.filter((r) => r.status === 'fulfilled')
    const recusadas = resultados.filter((r) => r.status === 'rejected')

    expect(criadas).toHaveLength(1)
    expect(recusadas).toHaveLength(1)

    // Duas cobranças do mesmo trabalho é o dano que o índice existe para evitar.
    const total = await prisma.fatura.count({
      where: { projetoId: PROJETO, status: { in: ['PENDENTE', 'PAGA'] } },
    })
    expect(total).toBe(1)
  })

  it('quem perde a corrida lê o motivo, não um erro de banco', async () => {
    const resultados = await Promise.allSettled([
      faturas.criarFatura(PROJETO, DESIGNER),
      faturas.criarFatura(PROJETO, DESIGNER),
    ])

    const recusada = resultados.find((r) => r.status === 'rejected') as PromiseRejectedResult
    // O controller casa /já existe/ para devolver 409. Se a P2002 vazasse crua,
    // a pessoa levaria 500 e a tela mostraria "erro interno" num caso previsto.
    expect(recusada.reason.message).toMatch(/já existe/i)
  })
})

describe('o que o índice precisa continuar permitindo', () => {
  it('cancelar e emitir outra funciona — senão a regra vira uma cela', async () => {
    const primeira = await faturas.criarFatura(PROJETO, DESIGNER)

    await prisma.fatura.update({ where: { id: primeira.id }, data: { status: 'CANCELADA' } })

    const segunda = await faturas.criarFatura(PROJETO, DESIGNER)
    expect(segunda.id).not.toBe(primeira.id)

    // O índice é parcial de propósito: canceladas podem se acumular à vontade.
    const canceladas = await prisma.fatura.count({
      where: { projetoId: PROJETO, status: 'CANCELADA' },
    })
    expect(canceladas).toBe(1)
  })

  it('várias canceladas convivem no mesmo projeto', async () => {
    for (let i = 0; i < 3; i++) {
      const f = await faturas.criarFatura(PROJETO, DESIGNER)
      await prisma.fatura.update({ where: { id: f.id }, data: { status: 'CANCELADA' } })
    }

    const canceladas = await prisma.fatura.count({
      where: { projetoId: PROJETO, status: 'CANCELADA' },
    })
    expect(canceladas).toBe(3)
  })

  it('uma fatura PAGA também segura o lugar', async () => {
    // PAGA está no índice junto de PENDENTE: emitir uma segunda cobrança de um
    // projeto que já foi pago é a duplicata mais cara que existe.
    const paga = await faturas.criarFatura(PROJETO, DESIGNER)
    await prisma.fatura.update({ where: { id: paga.id }, data: { status: 'PAGA' } })

    await expect(faturas.criarFatura(PROJETO, DESIGNER)).rejects.toThrow(/já existe/i)
  })
})
