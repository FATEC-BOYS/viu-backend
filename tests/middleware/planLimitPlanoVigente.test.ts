import { describe, it, expect, vi, beforeEach } from 'vitest'

/*
 * O middleware saía calado para quem não tinha assinatura ativa — "free tier,
 * sem limite". Como usuário novo nunca tem assinatura, o plano gratuito era
 * ilimitado na prática: o contrário do que a palavra "free" faz acreditar.
 *
 * O conserto seguinte trocou isso pelas variáveis `BETA_MAX_*`, e aí o teto
 * passou a sair do ambiente enquanto a taxa da fatura saía do plano Gratuito:
 * duas fontes para a mesma pergunta, que só batiam por coincidência (3 e 20
 * dos dois lados). Agora as duas leem `assinaturaVigente`, e quem não assina
 * pega os limites da linha do Gratuito — os mesmos que a tela de
 * administração de planos edita.
 */

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  return { default: criarPrismaMock() }
})

import prisma from '../../src/database/client.js'
import { requirePlanLimit } from '../../src/middleware/planLimitMiddleware.js'

function pedido() {
  return { usuario: { id: 'u1' } } as any
}

function resposta() {
  const reply: any = {
    statusCode: 200,
    body: null,
    status(code: number) { reply.statusCode = code; return reply },
    send(data: any) { reply.body = data; return reply },
  }
  return reply
}

/** A linha do Gratuito, que é onde cai quem não assina nada. */
const GRATUITO = {
  nome: 'Gratuito',
  precoMensal: 0,
  precoAnual: null,
  taxaPlataforma: 0.1,
  limitesProjetos: 3,
  limitesArtes: 20,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.assinatura.findFirst).mockResolvedValue(null)
  // `planoGratuitoDoDesigner` é quem responde quando não há assinatura.
  vi.mocked(prisma.plano.findFirst).mockResolvedValue(GRATUITO as never)
})

describe('sem assinatura ativa', () => {
  it('recusa ao chegar no teto do Gratuito', async () => {
    vi.mocked(prisma.projeto.count).mockResolvedValue(3)

    const reply = resposta()
    await requirePlanLimit('projetos')(pedido(), reply)

    expect(reply.statusCode).toBe(402)
    expect(reply.body.limite).toBe(3)
    // O nome do plano na mensagem é o que diz à pessoa onde mexer.
    expect(reply.body.message).toMatch(/plano "Gratuito"/)
  })

  /*
   * O teto vem da linha do banco, não de um número no código: mudar o plano
   * Gratuito na tela de administração tem que mudar o limite de verdade.
   */
  it('segue o limite que a linha do Gratuito declara', async () => {
    vi.mocked(prisma.plano.findFirst).mockResolvedValue({ ...GRATUITO, limitesProjetos: 7 } as never)
    vi.mocked(prisma.projeto.count).mockResolvedValue(6)

    const reply = resposta()
    await requirePlanLimit('projetos')(pedido(), reply)

    expect(reply.statusCode).toBe(200)
  })

  /*
   * Sem Gratuito cadastrado não há teto declarado em lugar nenhum. Bloquear
   * por um número inventado seria pior do que deixar passar.
   */
  it('deixa passar quando não há plano gratuito cadastrado', async () => {
    vi.mocked(prisma.plano.findFirst).mockResolvedValue(null as never)
    vi.mocked(prisma.projeto.count).mockResolvedValue(9999)

    const reply = resposta()
    await requirePlanLimit('projetos')(pedido(), reply)

    expect(reply.statusCode).toBe(200)
  })

  it('deixa passar quem ainda está abaixo do teto', async () => {
    vi.mocked(prisma.projeto.count).mockResolvedValue(2)

    const reply = resposta()
    await requirePlanLimit('projetos')(pedido(), reply)

    expect(reply.statusCode).toBe(200)
  })

  it('usa o teto de artes para artes', async () => {
    vi.mocked(prisma.arte.count).mockResolvedValue(20)

    const reply = resposta()
    await requirePlanLimit('artes')(pedido(), reply)

    expect(reply.statusCode).toBe(402)
    expect(reply.body.resource).toBe('artes')
    expect(reply.body.limite).toBe(20)
  })
})

describe('com assinatura ativa', () => {
  it('respeita o limite do plano de quem assina', async () => {
    vi.mocked(prisma.assinatura.findFirst).mockResolvedValue({
      status: 'ATIVA',
      renovacaoAutomatica: true,
      periodoFim: null,
      plano: { ...GRATUITO, nome: 'Pro', limitesProjetos: 10, limitesArtes: null },
    } as never)
    vi.mocked(prisma.projeto.count).mockResolvedValue(5)

    const reply = resposta()
    await requirePlanLimit('projetos')(pedido(), reply)

    expect(reply.statusCode).toBe(200)
  })

  /** `null` no plano continua significando ilimitado — é decisão de produto. */
  it('não impõe teto quando o plano não define limite', async () => {
    vi.mocked(prisma.assinatura.findFirst).mockResolvedValue({
      status: 'ATIVA',
      renovacaoAutomatica: true,
      periodoFim: null,
      plano: { ...GRATUITO, nome: 'Pro', limitesProjetos: 10, limitesArtes: null },
    } as never)
    vi.mocked(prisma.arte.count).mockResolvedValue(9999)

    const reply = resposta()
    await requirePlanLimit('artes')(pedido(), reply)

    expect(reply.statusCode).toBe(200)
    expect(prisma.arte.count).not.toHaveBeenCalled()
  })

  it('mantém a mensagem de upgrade de quem assina', async () => {
    vi.mocked(prisma.assinatura.findFirst).mockResolvedValue({
      status: 'ATIVA',
      renovacaoAutomatica: true,
      periodoFim: null,
      plano: { ...GRATUITO, nome: 'Pro', limitesProjetos: 10, limitesArtes: null },
    } as never)
    vi.mocked(prisma.projeto.count).mockResolvedValue(10)

    const reply = resposta()
    await requirePlanLimit('projetos')(pedido(), reply)

    expect(reply.statusCode).toBe(402)
    expect(reply.body.message).toMatch(/plano "Pro"/)
  })
})
