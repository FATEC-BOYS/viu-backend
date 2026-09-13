import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  const mock = criarPrismaMock()
  return { default: mock, prisma: mock }
})

vi.mock('../../src/services/mercadoPagoService.js', () => ({
  mpPayment: { create: vi.fn(), get: vi.fn() },
  mpPreApproval: {},
  mpRefund: { total: vi.fn() },
  validateMpWebhookSignature: vi.fn().mockReturnValue(true),
}))

vi.mock('../../src/services/contratoProjetoService.js', () => ({
  pendenciaDeContrato: vi.fn(async () => null),
  contratoProjetoService: {},
}))

import prisma from '../../src/database/client.js'
import { FaturaService } from '../../src/services/faturaService.js'

const db = prisma as any
const service = new FaturaService()

const DESIGNER = 'cd00000000000000000000001'
const CLIENTE = 'cc00000000000000000000001'
const PROJETO = 'cp00000000000000000000001'

/**
 * A taxa da plataforma saía de `TAXA_PADRAO = 0.10`, uma constante no código,
 * para todo designer sem assinatura — e no beta ninguém assina. Na prática a
 * taxa de TODA fatura vinha do código, a tabela `planos` estava vazia e a tela
 * de administração de planos não governava coisa nenhuma. Mudar a taxa exigia
 * deploy.
 */
beforeEach(() => {
  vi.clearAllMocks()
  db.projeto.findUnique.mockResolvedValue({
    id: PROJETO,
    nome: 'Identidade visual',
    orcamento: 100_000,
    designerId: DESIGNER,
    clienteId: CLIENTE,
  })
  db.usuario.findUnique.mockResolvedValue({ id: DESIGNER, tipo: 'DESIGNER' })
  db.fatura.findFirst.mockResolvedValue(null)
  db.fatura.create.mockImplementation(async (args: any) => ({ ...args.data, id: 'f1' }))
})

/** O que foi parar em `fatura.create`. */
function faturaCriada() {
  return db.fatura.create.mock.calls[0][0].data
}

describe('de onde sai a taxa da plataforma', () => {
  it('quem não assina paga a taxa do plano gratuito cadastrado', async () => {
    // Ausência de assinatura É o plano gratuito — não é ausência de plano.
    db.assinatura.findFirst.mockResolvedValue(null)
    db.plano.findFirst.mockResolvedValue({ taxaPlataforma: 0.1 })

    await service.criarFatura(PROJETO, DESIGNER)

    expect(db.plano.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tipo: 'DESIGNER', ativo: true, precoMensal: 0 },
      }),
    )
    expect(faturaCriada().taxaPlataforma).toBe(10_000)
    expect(faturaCriada().valorLiquidoDesigner).toBe(90_000)
  })

  it('mudar a taxa do plano gratuito muda a fatura, sem deploy', async () => {
    db.assinatura.findFirst.mockResolvedValue(null)
    db.plano.findFirst.mockResolvedValue({ taxaPlataforma: 0.07 })

    await service.criarFatura(PROJETO, DESIGNER)

    expect(faturaCriada().taxaPlataforma).toBe(7_000)
  })

  it('quem assina paga a taxa do plano dele, não a do gratuito', async () => {
    db.assinatura.findFirst.mockResolvedValue({ plano: { taxaPlataforma: 0.02 } })

    await service.criarFatura(PROJETO, DESIGNER)

    // Nem consulta o gratuito: a assinatura já respondeu.
    expect(db.plano.findFirst).not.toHaveBeenCalled()
    expect(faturaCriada().taxaPlataforma).toBe(2_000)
    expect(faturaCriada().valorLiquidoDesigner).toBe(98_000)
  })

  it('sem plano gratuito cadastrado, ainda emite fatura com a taxa base', async () => {
    // A constante não pode sumir: sem ela, um banco sem planos deixaria de
    // conseguir cobrar — pior do que aplicar a taxa base.
    db.assinatura.findFirst.mockResolvedValue(null)
    db.plano.findFirst.mockResolvedValue(null)

    await service.criarFatura(PROJETO, DESIGNER)

    expect(faturaCriada().taxaPlataforma).toBe(10_000)
  })

  it('havendo mais de um gratuito, usa sempre o mesmo — o mais antigo', async () => {
    // Sem ordem explícita o Postgres pode devolver outro a cada consulta, e a
    // taxa da fatura mudaria sozinha entre dois projetos iguais.
    db.assinatura.findFirst.mockResolvedValue(null)
    db.plano.findFirst.mockResolvedValue({ taxaPlataforma: 0.1 })

    await service.criarFatura(PROJETO, DESIGNER)

    expect(db.plano.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { criadoEm: 'asc' } }),
    )
  })

  it('taxa zero é um plano possível e não vira a taxa base por engano', async () => {
    // `?? TAXA_PADRAO` só cai em nulo; `|| TAXA_PADRAO` teria transformado
    // 0 em 10% — e o designer receberia 10% a menos do que o plano promete.
    db.assinatura.findFirst.mockResolvedValue({ plano: { taxaPlataforma: 0 } })

    await service.criarFatura(PROJETO, DESIGNER)

    expect(faturaCriada().taxaPlataforma).toBe(0)
    expect(faturaCriada().valorLiquidoDesigner).toBe(100_000)
  })
})
