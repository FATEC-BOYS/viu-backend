import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * O middleware saía calado para quem não tinha assinatura ativa — "free tier,
 * sem limite". Como usuário novo nunca tem assinatura, o plano gratuito era
 * ilimitado na prática: o contrário do que a palavra "free" faz acreditar.
 */

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  return { default: criarPrismaMock() }
})

const envFalso = vi.hoisted(() => ({ BETA_MAX_PROJETOS: 3, BETA_MAX_ARTES: 20 }))
vi.mock('../../src/config/env.js', () => ({ env: envFalso }))

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

beforeEach(() => {
  vi.clearAllMocks()
  envFalso.BETA_MAX_PROJETOS = 3
  envFalso.BETA_MAX_ARTES = 20
  vi.mocked(prisma.assinatura.findFirst).mockResolvedValue(null)
})

describe('sem assinatura ativa', () => {
  it('recusa ao chegar no teto do beta', async () => {
    vi.mocked(prisma.projeto.count).mockResolvedValue(3)

    const reply = resposta()
    await requirePlanLimit('projetos')(pedido(), reply)

    expect(reply.statusCode).toBe(402)
    expect(reply.body.limite).toBe(3)
    expect(reply.body.message).toMatch(/limite do beta/i)
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
  it('respeita o limite do plano em vez do teto do beta', async () => {
    vi.mocked(prisma.assinatura.findFirst).mockResolvedValue({
      plano: { nome: 'Pro', limitesProjetos: 10, limitesArtes: null },
    } as never)
    vi.mocked(prisma.projeto.count).mockResolvedValue(5)

    const reply = resposta()
    await requirePlanLimit('projetos')(pedido(), reply)

    expect(reply.statusCode).toBe(200)
  })

  /** `null` no plano continua significando ilimitado — é decisão de produto. */
  it('não impõe teto quando o plano não define limite', async () => {
    vi.mocked(prisma.assinatura.findFirst).mockResolvedValue({
      plano: { nome: 'Pro', limitesProjetos: 10, limitesArtes: null },
    } as never)
    vi.mocked(prisma.arte.count).mockResolvedValue(9999)

    const reply = resposta()
    await requirePlanLimit('artes')(pedido(), reply)

    expect(reply.statusCode).toBe(200)
    expect(prisma.arte.count).not.toHaveBeenCalled()
  })

  it('mantém a mensagem de upgrade de quem assina', async () => {
    vi.mocked(prisma.assinatura.findFirst).mockResolvedValue({
      plano: { nome: 'Pro', limitesProjetos: 10, limitesArtes: null },
    } as never)
    vi.mocked(prisma.projeto.count).mockResolvedValue(10)

    const reply = resposta()
    await requirePlanLimit('projetos')(pedido(), reply)

    expect(reply.statusCode).toBe(402)
    expect(reply.body.message).toMatch(/plano "Pro"/)
  })
})
