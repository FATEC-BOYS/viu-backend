import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  const mock = criarPrismaMock()
  return { default: mock, prisma: mock }
})
vi.mock('../../src/services/notificacaoService.js', () => ({
  notificacaoService: { dispatch: vi.fn() },
}))

import { prisma } from '../../src/database/client.js'
import { FaturaService } from '../../src/services/faturaService.js'

const service = new FaturaService()
const db = prisma as any

const DESIGNER = 'cd0000000000000000000001'
const CLIENTE = 'cc0000000000000000000001'
const PROJETO = 'cp0000000000000000000001'

function projetoOk() {
  db.projeto.findUnique.mockResolvedValue({
    id: PROJETO, nome: 'Site', orcamento: 15000, designerId: DESIGNER, clienteId: CLIENTE,
  })
  db.usuario.findUnique.mockResolvedValue({ id: DESIGNER, tipo: 'DESIGNER' })
  db.assinatura.findFirst.mockResolvedValue(null)
  db.fatura.findFirst.mockResolvedValue(null)
}

beforeEach(() => {
  vi.clearAllMocks()
})

/**
 * Duas faturas ativas no mesmo projeto significam dois QR codes válidos para o
 * mesmo trabalho — o id da fatura é a chave de idempotência no Mercado Pago,
 * então ids diferentes geram cobranças diferentes e o cliente pode pagar as
 * duas. É o erro mais caro que este serviço pode cometer.
 */
describe('uma fatura ativa por projeto', () => {
  it('recusa quando a checagem encontra uma fatura ativa', async () => {
    projetoOk()
    db.fatura.findFirst.mockResolvedValue({ id: 'cf1', status: 'PENDENTE' })
    await expect(service.criarFatura(PROJETO, DESIGNER)).rejects.toThrow(
      'Já existe uma fatura ativa para este projeto',
    )
    expect(db.fatura.create).not.toHaveBeenCalled()
  })

  /*
   * O caso que a checagem NÃO pega: entre o `findFirst` e o `create` cabe
   * outra requisição inteira. Quem garante é o índice parcial no banco, e
   * perder essa corrida precisa chegar na tela como regra de negócio — o
   * controller casa /ja existe/ e devolve 409 — e não como um 500.
   */
  it('traduz a violação do índice na mesma recusa, e não em erro de servidor', async () => {
    projetoOk()
    const violacao: any = new Error('Unique constraint failed')
    violacao.code = 'P2002'
    // A forma que o Postgres realmente produz, conferida contra banco de
    // verdade em tests/concorrencia/fatura-duplicada.test.ts: `meta.target` é a
    // lista de CAMPOS do índice, não o nome dele. Este teste já existiu com
    // `target: 'faturas_uma_ativa_por_projeto'` e passava — confirmando a
    // suposição de quem o escreveu enquanto a tradução, em produção, nunca
    // disparava e a P2002 chegava crua na tela como 500.
    violacao.meta = { modelName: 'Fatura', target: ['projetoId'] }
    db.fatura.create.mockRejectedValue(violacao)

    await expect(service.criarFatura(PROJETO, DESIGNER)).rejects.toThrow(
      'Já existe uma fatura ativa para este projeto',
    )
  })

  it('aceita também o nome do índice, caso o driver passe a mandá-lo', async () => {
    projetoOk()
    const violacao: any = new Error('Unique constraint failed')
    violacao.code = 'P2002'
    violacao.meta = { target: 'faturas_uma_ativa_por_projeto' }
    db.fatura.create.mockRejectedValue(violacao)

    await expect(service.criarFatura(PROJETO, DESIGNER)).rejects.toThrow(
      'Já existe uma fatura ativa para este projeto',
    )
  })

  it('não engole outros erros do banco como se fossem duplicata', async () => {
    projetoOk()
    const outro: any = new Error('connection reset')
    outro.code = 'P1001'
    db.fatura.create.mockRejectedValue(outro)

    await expect(service.criarFatura(PROJETO, DESIGNER)).rejects.toThrow('connection reset')
  })

  it('não confunde com a violação de OUTRO índice único', async () => {
    projetoOk()
    const outroIndice: any = new Error('Unique constraint failed')
    outroIndice.code = 'P2002'
    outroIndice.meta = { modelName: 'Pagamento', target: ['faturaId'] }
    db.fatura.create.mockRejectedValue(outroIndice)

    await expect(service.criarFatura(PROJETO, DESIGNER)).rejects.toThrow('Unique constraint failed')
  })
})

describe('o que mais impede uma fatura de nascer', () => {
  it('exige orçamento no projeto', async () => {
    projetoOk()
    db.projeto.findUnique.mockResolvedValue({
      id: PROJETO, nome: 'Site', orcamento: null, designerId: DESIGNER, clienteId: CLIENTE,
    })
    await expect(service.criarFatura(PROJETO, DESIGNER)).rejects.toThrow(
      'Projeto não possui orçamento definido',
    )
  })

  it('recusa quem não é o designer do projeto', async () => {
    projetoOk()
    db.usuario.findUnique.mockResolvedValue({ id: CLIENTE, tipo: 'CLIENTE' })
    await expect(service.criarFatura(PROJETO, CLIENTE)).rejects.toThrow(
      'Apenas o designer do projeto pode criar faturas',
    )
  })

  it('deixa o ADMIN gerar em nome do designer', async () => {
    projetoOk()
    db.usuario.findUnique.mockResolvedValue({ id: 'cadmin', tipo: 'ADMIN' })
    db.fatura.create.mockResolvedValue({ id: 'cf1', valor: 15000 })
    await expect(service.criarFatura(PROJETO, 'cadmin')).resolves.toBeTruthy()
  })
})
