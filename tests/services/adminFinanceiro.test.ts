import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  return { default: criarPrismaMock() }
})

import prisma from '../../src/database/client.js'
import { AdminFinanceiroService } from '../../src/services/adminFinanceiroService.js'

const service = new AdminFinanceiroService()
const PERIODO = { inicio: new Date('2026-09-01T00:00:00'), fim: new Date('2026-09-30T23:59:59.999') }

function agregado(sums: Record<string, number>, count = 1) {
  return { _sum: sums, _count: { _all: count } } as never
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.fatura.aggregate).mockResolvedValue(agregado({}, 0))
  vi.mocked(prisma.saque.aggregate).mockResolvedValue(agregado({}, 0))
  vi.mocked(prisma.disputa.aggregate).mockResolvedValue(agregado({}, 0))
  vi.mocked(prisma.fatura.findMany).mockResolvedValue([] as never)
  vi.mocked(prisma.saque.findMany).mockResolvedValue([] as never)
})

/*
 * A taxa retida de cada fatura é a receita do VIU — calculada em
 * `faturaService`, gravada em `Fatura.taxaPlataforma`, e somada em lugar
 * nenhum. O `adminResumoService` acompanha funil, fila e usuários novos, e de
 * dinheiro não fala: não havia como responder "quanto faturamos no mês
 * passado" sem abrir o banco.
 */
describe('O resumo financeiro da plataforma', () => {
  it('soma a taxa retida como receita, separada do volume', async () => {
    vi.mocked(prisma.fatura.aggregate).mockResolvedValue(
      agregado({ valor: 1200000, taxaPlataforma: 60000, valorLiquidoDesigner: 1140000 }, 3),
    )

    const r = await service.resumo(PERIODO)

    expect(r.receita.valor).toBe(60000)
    expect(r.volume.valor).toBe(1200000)
    expect(r.repassado.valor).toBe(1140000)
    // Receita + repasse têm que fechar com o volume, senão a conta mente.
    expect(r.receita.valor + r.repassado.valor).toBe(r.volume.valor)
  })

  /*
   * Fatura emitida em setembro e paga em outubro é receita de OUTUBRO. Usar
   * `criadoEm` jogaria o número para o mês errado — erro que só aparece quando
   * alguém confere contra o extrato bancário.
   */
  it('conta a entrada pela data do pagamento, não pela da emissão', async () => {
    await service.resumo(PERIODO)

    const { where } = vi.mocked(prisma.fatura.aggregate).mock.calls[0][0] as any
    expect(where.status).toBe('PAGA')
    expect(where.dataPagamento).toEqual({ gte: PERIODO.inicio, lte: PERIODO.fim })
    expect(where.criadoEm).toBeUndefined()
  })

  /*
   * "A pagar" é dívida de hoje, não fato do mês: recortá-la por período
   * esconderia um saque pedido em agosto e ainda não pago.
   */
  it('não recorta por período o que ainda se deve', async () => {
    await service.resumo(PERIODO)

    const chamadas = vi.mocked(prisma.saque.aggregate).mock.calls.map((c) => (c[0] as any).where)
    const aPagar = chamadas.find((w) => Array.isArray(w.status?.in))
    expect(aPagar.status.in).toEqual(['SOLICITADO', 'PROCESSANDO'])
    expect(aPagar.atualizadoEm).toBeUndefined()
  })

  it('mostra o retido em disputa, que é dinheiro parado', async () => {
    vi.mocked(prisma.disputa.aggregate).mockResolvedValue(agregado({ saldoBloqueado: 1080000 }, 1))

    const r = await service.resumo(PERIODO)

    expect(r.retidoEmDisputa.valor).toBe(1080000)
    expect(r.retidoEmDisputa.valorFormatado).toContain('10.800,00')
  })

  /*
   * A emissão de nota ainda não existe. O campo aparece declarado e nulo, e
   * não ausente: sumir da resposta seria esconder de quem audita justamente a
   * pendência que ele precisa enxergar.
   */
  it('declara a nota fiscal como pendente em vez de omiti-la', async () => {
    const r = await service.resumo(PERIODO)
    expect('notasFiscais' in r).toBe(true)
    expect(r.notasFiscais).toBeNull()
  })
})

describe('Os movimentos do período', () => {
  function fatura(extra: Record<string, unknown> = {}) {
    return {
      id: 'fat1',
      valor: 1200000,
      taxaPlataforma: 60000,
      valorLiquidoDesigner: 1140000,
      dataPagamento: new Date('2026-09-15T14:00:00'),
      projeto: { id: 'proj1', nome: 'Rebranding' },
      cliente: { id: 'c1', nome: 'João Santos' },
      designer: { id: 'd1', nome: 'Ana Silva' },
      ...extra,
    }
  }

  /* A quebra entre valor, taxa e líquido é o que distingue auditoria de
     extrato — e não está no ledger, cuja `referencia` é só uma string. */
  it('traz a quebra completa de cada fatura paga', async () => {
    vi.mocked(prisma.fatura.findMany).mockResolvedValue([fatura()] as never)

    const [m] = await service.movimentos(PERIODO)

    expect(m.tipo).toBe('ENTRADA')
    expect(m.valor).toBe(1200000)
    expect(m.taxaPlataforma).toBe(60000)
    expect(m.valorLiquidoDesigner).toBe(1140000)
    expect(m.referencia).toBe('fatura:fat1')
    expect(m.contraparte).toBe('João Santos')
  })

  it('junta entradas e saídas numa ordem só, da mais recente', async () => {
    vi.mocked(prisma.fatura.findMany).mockResolvedValue([fatura()] as never)
    vi.mocked(prisma.saque.findMany).mockResolvedValue([
      {
        id: 'saq1',
        valor: 500000,
        atualizadoEm: new Date('2026-09-20T10:00:00'),
        designer: { id: 'd1', nome: 'Ana Silva' },
        chavePix: { tipo: 'CPF', chave: '529...' },
      },
    ] as never)

    const ms = await service.movimentos(PERIODO)

    expect(ms.map((m) => m.tipo)).toEqual(['SAIDA', 'ENTRADA'])
  })

  /* Saque não tem quebra: o valor inteiro sai para o designer. */
  it('não inventa taxa num saque', async () => {
    vi.mocked(prisma.saque.findMany).mockResolvedValue([
      {
        id: 'saq1',
        valor: 500000,
        atualizadoEm: new Date('2026-09-20T10:00:00'),
        designer: { id: 'd1', nome: 'Ana Silva' },
        chavePix: null,
      },
    ] as never)

    const [m] = await service.movimentos(PERIODO)

    expect(m.taxaPlataforma).toBe(0)
    expect(m.valorLiquidoDesigner).toBe(500000)
  })

  it('não quebra quando o projeto foi removido', async () => {
    vi.mocked(prisma.fatura.findMany).mockResolvedValue([fatura({ projeto: null })] as never)

    const [m] = await service.movimentos(PERIODO)

    expect(m.descricao).toContain('projeto removido')
    expect(m.projetoId).toBeNull()
  })
})
