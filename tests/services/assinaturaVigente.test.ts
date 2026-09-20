import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  return { default: criarPrismaMock() }
})

import prisma from '../../src/database/client.js'
import { assinaturaVigente } from '../../src/services/assinaturaVigente.js'
import { AssinaturaService } from '../../src/services/assinaturaService.js'

const service = new AssinaturaService()

const GRATUITO = {
  id: 'plano-gratuito',
  nome: 'Gratuito',
  precoMensal: 0,
  precoAnual: null,
  taxaPlataforma: 0.1,
  limitesProjetos: 3,
  limitesArtes: 20,
}

const PROFISSIONAL = {
  id: 'plano-pro',
  nome: 'Profissional',
  precoMensal: 4900,
  precoAnual: null,
  taxaPlataforma: 0.05,
  limitesProjetos: null,
  limitesArtes: null,
}

const DAQUI_A_27_DIAS = new Date(Date.now() + 27 * 86400000)
const ONTEM = new Date(Date.now() - 86400000)

function assinatura(extra: Record<string, unknown> = {}) {
  return {
    id: 'ass1',
    usuarioId: 'designer1',
    status: 'ATIVA',
    renovacaoAutomatica: true,
    periodoInicio: new Date(Date.now() - 3 * 86400000),
    periodoFim: DAQUI_A_27_DIAS,
    mpPreapprovalId: 'mp-1',
    plano: PROFISSIONAL,
    ...extra,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.assinatura.findFirst).mockResolvedValue(null as never)
  vi.mocked(prisma.plano.findFirst).mockResolvedValue(GRATUITO as never)
})

/*
 * A mesma pergunta era respondida em três lugares diferentes: a taxa da fatura
 * caía no plano Gratuito, o teto de recursos caía nas variáveis BETA_MAX_*, e
 * /assinaturas/minha não caía em nada e respondia `null` — que a tela desenhava
 * como "Você ainda não tem uma assinatura ativa" para quem o resto do sistema
 * já tratava como assinante do Gratuito.
 */
describe('Qual plano vale agora', () => {
  it('põe quem não assina nada no Gratuito, em vez de deixar sem plano', async () => {
    const v = await assinaturaVigente('designer1')

    expect(v.assinatura).toBeNull()
    expect(v.plano?.nome).toBe('Gratuito')
    // A ausência de assinatura é o plano, não a ausência de plano.
    expect(v.plano?.limitesProjetos).toBe(3)
  })

  it('devolve o plano assinado de quem assina', async () => {
    vi.mocked(prisma.assinatura.findFirst).mockResolvedValue(assinatura() as never)

    const v = await assinaturaVigente('designer1')

    expect(v.plano?.nome).toBe('Profissional')
    expect(v.cancelada).toBe(false)
    expect(v.vigenteAte).toBeNull()
  })

  /* O plano chega formatado: era isto que faltava e deixava "Taxa da
   * plataforma" em branco na tela de assinatura. */
  it('entrega o plano formatado, que é o que a tela lê', async () => {
    vi.mocked(prisma.assinatura.findFirst).mockResolvedValue(assinatura() as never)

    const v = await assinaturaVigente('designer1')

    expect(v.plano?.taxaPlataformaFormatada).toBe('5%')
    expect(v.plano?.precoMensalFormatado).toContain('49,00')
  })

  it('marca como cancelada a que está correndo até o fim do período pago', async () => {
    vi.mocked(prisma.assinatura.findFirst).mockResolvedValue(
      assinatura({ renovacaoAutomatica: false }) as never,
    )

    const v = await assinaturaVigente('designer1')

    expect(v.cancelada).toBe(true)
    expect(v.vigenteAte).toEqual(DAQUI_A_27_DIAS)
    // Continua valendo: o plano ainda é o pago, não o Gratuito.
    expect(v.plano?.nome).toBe('Profissional')
  })

  /*
   * Não há job no backend, então o vencimento acontece na leitura — e precisa
   * acontecer, senão uma assinatura cancelada valeria para sempre.
   */
  it('vence na leitura o que passou da data e devolve o Gratuito', async () => {
    vi.mocked(prisma.assinatura.findFirst).mockResolvedValue(
      assinatura({ renovacaoAutomatica: false, periodoFim: ONTEM }) as never,
    )
    vi.mocked(prisma.assinatura.updateMany).mockResolvedValue({ count: 1 } as never)

    const v = await assinaturaVigente('designer1')

    const escrita = vi.mocked(prisma.assinatura.updateMany).mock.calls[0][0] as any
    expect(escrita.data.status).toBe('EXPIRADA')
    // Guardado pelo status e pela data: duas requisições simultâneas escrevem
    // a mesma coisa em vez de contarem o vencimento duas vezes.
    expect(escrita.where.status).toBe('ATIVA')
    expect(escrita.where.periodoFim).toHaveProperty('lte')

    expect(v.assinatura).toBeNull()
    expect(v.plano?.nome).toBe('Gratuito')
  })

  it('não vence quem ainda tem data pela frente', async () => {
    vi.mocked(prisma.assinatura.findFirst).mockResolvedValue(assinatura() as never)

    await assinaturaVigente('designer1')

    expect(prisma.assinatura.updateMany).not.toHaveBeenCalled()
  })

  /* Assinatura sem data de fim não tem como vencer — é o caso do Gratuito. */
  it('não vence assinatura sem periodoFim', async () => {
    vi.mocked(prisma.assinatura.findFirst).mockResolvedValue(
      assinatura({ plano: GRATUITO, periodoFim: null }) as never,
    )

    const v = await assinaturaVigente('designer1')

    expect(prisma.assinatura.updateMany).not.toHaveBeenCalled()
    expect(v.plano?.nome).toBe('Gratuito')
  })
})

/*
 * O diálogo da tela prometia "você perderá acesso ao final do período pago" e
 * o código gravava CANCELADA na hora. Conferido no app: com 27 dias pagos pela
 * frente, POST /projetos passou de aceito para 402 logo depois do clique.
 */
describe('Cancelar não confisca o que já foi pago', () => {
  beforeEach(() => {
    vi.mocked(prisma.assinatura.update).mockResolvedValue({ id: 'ass1' } as never)
    // `mpPreapprovalId: null` nos fixtures: sem id não há chamada ao gateway,
    // e o que está sob teste aqui é o que se grava no banco.
  })

  it('só desliga a renovação quando ainda há período pago', async () => {
    vi.mocked(prisma.assinatura.findUnique).mockResolvedValue(
      assinatura({ mpPreapprovalId: null }) as never,
    )

    await service.cancelarAssinatura('ass1', 'designer1')

    const escrita = vi.mocked(prisma.assinatura.update).mock.calls[0][0] as any
    expect(escrita.data).toEqual({ renovacaoAutomatica: false })
    // O status continua ATIVA: é o que mantém a taxa e o teto do plano pago.
    expect(escrita.data.status).toBeUndefined()
  })

  it('encerra na hora quando não há período pago pela frente', async () => {
    vi.mocked(prisma.assinatura.findUnique).mockResolvedValue(
      assinatura({ mpPreapprovalId: null, plano: GRATUITO, periodoFim: null }) as never,
    )

    await service.cancelarAssinatura('ass1', 'designer1')

    const escrita = vi.mocked(prisma.assinatura.update).mock.calls[0][0] as any
    expect(escrita.data.status).toBe('CANCELADA')
  })

  it('encerra na hora quando a data já passou', async () => {
    vi.mocked(prisma.assinatura.findUnique).mockResolvedValue(
      assinatura({ mpPreapprovalId: null, periodoFim: ONTEM }) as never,
    )

    await service.cancelarAssinatura('ass1', 'designer1')

    expect((vi.mocked(prisma.assinatura.update).mock.calls[0][0] as any).data.status).toBe('CANCELADA')
  })
})
