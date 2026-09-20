import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  return { default: criarPrismaMock() }
})

import prisma from '../../src/database/client.js'
import { SaqueService } from '../../src/services/saqueService.js'

const db = prisma as any
const service = new SaqueService()

const DESIGNER = 'cdesigner000000001'
const CHAVE = 'cchave0000000001'

const SAQUE = {
  id: 'csaque000000001',
  valor: 100000,
  status: 'SOLICITADO',
  designerId: DESIGNER,
  chavePixId: CHAVE,
  criadoEm: new Date('2026-09-20T12:00:00.000Z'),
  chavePix: { id: CHAVE, tipo: 'EMAIL', chave: 'ana@estudio.com', titular: 'Ana Silva', ativa: true },
}

beforeEach(() => vi.clearAllMocks())

/**
 * Toda rota que descreve um saque descreve do mesmo jeito.
 *
 * A formatação estava copiada nas duas listagens e faltava na criação, que
 * devolvia a linha crua do Prisma. Como a tela insere o saque recém-criado
 * direto no histórico, ele aparecia SEM VALOR — só a chave e a data.
 * Conferido no app: `POST /saques` voltava sem `valorFormatado`, `GET /saques`
 * com.
 */
describe('Um saque é formatado igual em toda rota', () => {
  it('a criação devolve os campos formatados', async () => {
    db.chavePix.findUnique.mockResolvedValue({ id: CHAVE, ativa: true, usuarioId: DESIGNER })
    db.fatura.aggregate.mockResolvedValue({ _sum: { valorLiquidoDesigner: 500000 } })
    db.saque.aggregate.mockResolvedValue({ _sum: { valor: 0 } })
    db.disputa.aggregate.mockResolvedValue({ _sum: { saldoBloqueado: 0 } })
    db.saque.create.mockResolvedValue(SAQUE)
    db.$transaction.mockImplementation((fn: any) => fn(db))

    const criado: any = await service.solicitarSaque(DESIGNER, CHAVE, 100000)

    expect(criado.valorFormatado).toBeTruthy()
    expect(criado.criadoEmFormatado).toBeTruthy()
  })

  it('a listagem devolve os mesmos campos', async () => {
    db.saque.findMany.mockResolvedValue([SAQUE])

    const [saque]: any = await service.listarSaques(DESIGNER)

    expect(saque.valorFormatado).toBeTruthy()
    expect(saque.criadoEmFormatado).toBeTruthy()
  })

  it('criação e listagem concordam no valor, campo a campo', async () => {
    // O ponto não é o formato em si — é as duas rotas não divergirem.
    db.chavePix.findUnique.mockResolvedValue({ id: CHAVE, ativa: true, usuarioId: DESIGNER })
    db.fatura.aggregate.mockResolvedValue({ _sum: { valorLiquidoDesigner: 500000 } })
    db.saque.aggregate.mockResolvedValue({ _sum: { valor: 0 } })
    db.disputa.aggregate.mockResolvedValue({ _sum: { saldoBloqueado: 0 } })
    db.saque.create.mockResolvedValue(SAQUE)
    db.$transaction.mockImplementation((fn: any) => fn(db))
    db.saque.findMany.mockResolvedValue([SAQUE])

    const criado: any = await service.solicitarSaque(DESIGNER, CHAVE, 100000)
    const [listado]: any = await service.listarSaques(DESIGNER)

    expect(criado.valorFormatado).toBe(listado.valorFormatado)
    expect(criado.criadoEmFormatado).toBe(listado.criadoEmFormatado)
  })
})

/**
 * O mínimo é do servidor, e a tela precisa poder perguntar qual é.
 *
 * Ela tinha a própria cópia do número (`valor < 500`) e a própria frase
 * ("Mínimo R$ 5,00"). Duas fontes para uma regra só.
 */
describe('Saldo carrega o valor mínimo de saque', () => {
  it('devolve o mínimo junto do saldo', async () => {
    db.fatura.aggregate.mockResolvedValue({ _sum: { valorLiquidoDesigner: 500000 } })
    db.saque.aggregate.mockResolvedValue({ _sum: { valor: 0 } })
    db.disputa.aggregate.mockResolvedValue({ _sum: { saldoBloqueado: 0 } })

    const saldo: any = await service.getSaldoDisponivel(DESIGNER)

    expect(saldo.valorMinimo).toBeGreaterThan(0)
    expect(saldo.valorMinimoFormatado).toBeTruthy()
  })

  it('o mínimo anunciado é o mesmo que a solicitação cobra', async () => {
    // Se divergirem, a tela promete um valor que o servidor recusa.
    db.fatura.aggregate.mockResolvedValue({ _sum: { valorLiquidoDesigner: 500000 } })
    db.saque.aggregate.mockResolvedValue({ _sum: { valor: 0 } })
    db.disputa.aggregate.mockResolvedValue({ _sum: { saldoBloqueado: 0 } })
    const saldo: any = await service.getSaldoDisponivel(DESIGNER)

    db.chavePix.findUnique.mockResolvedValue({ id: CHAVE, ativa: true, usuarioId: DESIGNER })
    db.$transaction.mockImplementation((fn: any) => fn(db))

    await expect(
      service.solicitarSaque(DESIGNER, CHAVE, saldo.valorMinimo - 1),
    ).rejects.toThrow(/mínimo/i)
  })
})
