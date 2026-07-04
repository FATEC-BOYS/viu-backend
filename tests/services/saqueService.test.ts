import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SaqueService } from '../../src/services/saqueService.js'

vi.mock('../../src/database/client.js', () => ({
  default: {
    chavePix: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    fatura: {
      aggregate: vi.fn(),
    },
    saque: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      aggregate: vi.fn(),
    },
    ledgerEntry: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

import prisma from '../../src/database/client.js'

const service = new SaqueService()

beforeEach(() => vi.clearAllMocks())

// ─── solicitarSaque ───────────────────────────────────────────────────────

describe('SaqueService.solicitarSaque', () => {
  it('lança erro se valor abaixo do mínimo', async () => {
    await expect(service.solicitarSaque('d1', 'c1', 100)).rejects.toThrow('mínimo')
  })

  it('lança erro se saldo insuficiente', async () => {
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
      if (typeof fn === 'function') {
        const tx = {
          chavePix: { findUnique: vi.fn().mockResolvedValue({ id: 'c1', ativa: true, usuarioId: 'd1' }) },
          fatura: { aggregate: vi.fn().mockResolvedValue({ _sum: { valorLiquidoDesigner: 1000 } }) },
          saque: { aggregate: vi.fn().mockResolvedValue({ _sum: { valor: 1000 } }) },
        }
        return fn(tx)
      }
      return fn
    })

    await expect(service.solicitarSaque('d1', 'c1', 500)).rejects.toThrow('Saldo insuficiente')
  })
})

// ─── processarSaque ───────────────────────────────────────────────────────

describe('SaqueService.processarSaque', () => {
  it('lança erro se saque não encontrado', async () => {
    vi.mocked(prisma.saque.findUnique).mockResolvedValue(null)
    await expect(service.processarSaque('s1', 'PROCESSANDO')).rejects.toThrow('não encontrado')
  })

  it('lança erro em transição inválida', async () => {
    vi.mocked(prisma.saque.findUnique).mockResolvedValue({ id: 's1', status: 'CONCLUIDO', valor: 1000, designerId: 'd1' } as any)
    await expect(service.processarSaque('s1', 'SOLICITADO')).rejects.toThrow('Transição inválida')
  })

  it('atualiza saque sem ledger para transição não-terminal', async () => {
    vi.mocked(prisma.saque.findUnique).mockResolvedValue({ id: 's1', status: 'SOLICITADO', valor: 1000, designerId: 'd1' } as any)
    vi.mocked(prisma.saque.update).mockResolvedValue({ id: 's1', status: 'PROCESSANDO' } as any)

    const result = await service.processarSaque('s1', 'PROCESSANDO')
    expect(result.status).toBe('PROCESSANDO')
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('usa transação e cria ledger DEBITO quando → CONCLUIDO', async () => {
    vi.mocked(prisma.saque.findUnique).mockResolvedValue({ id: 's2', status: 'PROCESSANDO', valor: 5000, designerId: 'd1' } as any)
    vi.mocked(prisma.$transaction).mockResolvedValue([{ id: 's2', status: 'CONCLUIDO' }, {}] as any)

    const result = await service.processarSaque('s2', 'CONCLUIDO')
    expect(prisma.$transaction).toHaveBeenCalled()
    expect(result.status).toBe('CONCLUIDO')
  })
})

// ─── getSaldoDisponivel ───────────────────────────────────────────────────

describe('SaqueService.getSaldoDisponivel', () => {
  it('calcula saldo como faturas pagas menos saques ativos', async () => {
    vi.mocked(prisma.fatura.aggregate).mockResolvedValue({ _sum: { valorLiquidoDesigner: 10000 } } as any)
    vi.mocked(prisma.saque.aggregate).mockResolvedValue({ _sum: { valor: 3000 } } as any)

    const result = await service.getSaldoDisponivel('d1')
    expect(result.saldo).toBe(7000)
    expect(result.totalRecebido).toBe(10000)
    expect(result.totalSacado).toBe(3000)
  })
})
