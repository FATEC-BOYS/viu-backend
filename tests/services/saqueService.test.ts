import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SaqueService } from '../../src/services/saqueService.js'
import { formatCurrency } from '../../src/utils/formatters.js'

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  return { default: criarPrismaMock() }
})

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
          // Terceira leitura desde que disputa aberta trava saldo.
          disputa: { aggregate: vi.fn().mockResolvedValue({ _sum: { saldoBloqueado: 0 } }) },
        }
        return fn(tx)
      }
      return fn
    })

    await expect(service.solicitarSaque('d1', 'c1', 500)).rejects.toThrow('Saldo insuficiente')
  })
})

// ─── saldo x disputas ─────────────────────────────────────────────────────
/**
 * Disputa aberta congela `saldoBloqueado`, mas nenhuma query de saldo lia esse
 * campo: o designer sacava o valor em disputa antes de o admin resolver. Estes
 * testes fixam que o valor bloqueado sai do saldo enquanto a disputa não
 * termina.
 */

/** Monta o `tx` que solicitarSaque recebe, com as três agregações. */
function txComSaldo(opts: {
  recebido: number
  sacado: number
  bloqueado: number
  chave?: any
}) {
  return {
    chavePix: {
      findUnique: vi.fn().mockResolvedValue(
        opts.chave ?? { id: 'c1', ativa: true, usuarioId: 'd1' },
      ),
    },
    fatura: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { valorLiquidoDesigner: opts.recebido } }),
    },
    saque: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { valor: opts.sacado } }),
      create: vi.fn().mockResolvedValue({ id: 's1', valor: 0 }),
    },
    disputa: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { saldoBloqueado: opts.bloqueado } }),
    },
  }
}

function mockarTransacao(tx: any) {
  vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) =>
    typeof fn === 'function' ? fn(tx) : fn,
  )
}

describe('SaqueService.getSaldoDisponivel — disputas', () => {
  function mockarAgregacoes(recebido: number, sacado: number, bloqueado: number) {
    vi.mocked(prisma.fatura.aggregate).mockResolvedValue({
      _sum: { valorLiquidoDesigner: recebido },
    } as any)
    vi.mocked(prisma.saque.aggregate).mockResolvedValue({ _sum: { valor: sacado } } as any)
    vi.mocked(prisma.disputa.aggregate).mockResolvedValue({
      _sum: { saldoBloqueado: bloqueado },
    } as any)
  }

  it('desconta o valor bloqueado por disputa aberta', async () => {
    mockarAgregacoes(1000, 0, 400)

    const r = await service.getSaldoDisponivel('d1')

    expect(r.saldo).toBe(600)
    expect(r.saldoBloqueado).toBe(400)
  })

  it('consulta apenas disputas em estado não-terminal e do designer da fatura', async () => {
    mockarAgregacoes(1000, 0, 0)

    await service.getSaldoDisponivel('d1')

    const where = vi.mocked(prisma.disputa.aggregate).mock.calls[0][0].where as any
    // Resolvida não bloqueia mais nada.
    expect(where.status.in).toEqual(
      expect.arrayContaining(['ABERTA', 'EM_ANALISE', 'ESCALADA']),
    )
    expect(where.status.in).not.toContain('RESOLVIDA_DESIGNER')
    expect(where.status.in).not.toContain('RESOLVIDA_CLIENTE')
    // Disputa não tem designerId; o vínculo é pela fatura de onde veio o valor.
    expect(where.fatura).toEqual({ designerId: 'd1' })
  })

  it('sem disputa bloqueante o saldo é o de antes', async () => {
    mockarAgregacoes(1000, 300, 0)

    const r = await service.getSaldoDisponivel('d1')

    expect(r.saldo).toBe(700)
    expect(r.saldoBloqueado).toBe(0)
  })

  it('bloqueado maior que o recebido devolve saldo negativo, sem esconder em zero', async () => {
    // Clamp em zero mascararia a divida — e e justamente o que a opcao D
    // precisa enxergar para tornar o buraco visivel.
    mockarAgregacoes(500, 0, 900)

    const r = await service.getSaldoDisponivel('d1')

    expect(r.saldo).toBe(-400)
  })

  it('expõe o valor bloqueado formatado para a UI poder explicar a queda', async () => {
    mockarAgregacoes(1000, 0, 400)

    const r = await service.getSaldoDisponivel('d1')

    expect(r.saldoBloqueadoFormatado).toBe(formatCurrency(400))
  })
})

describe('SaqueService.solicitarSaque — disputas', () => {
  it('recusa saque do valor que está em disputa', async () => {
    const tx = txComSaldo({ recebido: 1000, sacado: 0, bloqueado: 1000 })
    mockarTransacao(tx)

    await expect(service.solicitarSaque('d1', 'c1', 1000)).rejects.toThrow(
      'Saldo insuficiente',
    )
    expect(tx.saque.create).not.toHaveBeenCalled()
  })

  it('permite sacar o que sobra fora da disputa', async () => {
    const tx = txComSaldo({ recebido: 1000, sacado: 0, bloqueado: 400 })
    mockarTransacao(tx)

    await service.solicitarSaque('d1', 'c1', 600)

    expect(tx.saque.create).toHaveBeenCalled()
  })

  it('lê as disputas dentro da transação, não fora dela', async () => {
    // Ler fora seria TOCTOU: disputa aberta entre a leitura e o insert passaria.
    const tx = txComSaldo({ recebido: 1000, sacado: 0, bloqueado: 0 })
    mockarTransacao(tx)

    await service.solicitarSaque('d1', 'c1', 500)

    expect(tx.disputa.aggregate).toHaveBeenCalled()
    // NOTA: com o mock, `tx` e o prisma global sao o mesmo objeto em outros
    // testes; o isolamento de verdade so e exercitado em tests/concorrencia,
    // contra Postgres real.
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
    await expect(service.processarSaque('s1', 'SOLICITADO')).rejects.toThrow('é terminal')
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
  it('calcula saldo como faturas pagas menos saques ativos e menos disputas', async () => {
    vi.mocked(prisma.fatura.aggregate).mockResolvedValue({ _sum: { valorLiquidoDesigner: 10000 } } as any)
    vi.mocked(prisma.saque.aggregate).mockResolvedValue({ _sum: { valor: 3000 } } as any)
    // Explícito de propósito: vi.clearAllMocks() zera as chamadas mas mantém as
    // implementações, então sem declarar aqui este teste herdaria o valor
    // bloqueado de outro caso e passaria a medir outra coisa.
    vi.mocked(prisma.disputa.aggregate).mockResolvedValue({ _sum: { saldoBloqueado: 0 } } as any)

    const result = await service.getSaldoDisponivel('d1')
    expect(result.saldo).toBe(7000)
    expect(result.totalRecebido).toBe(10000)
    expect(result.totalSacado).toBe(3000)
  })
})
