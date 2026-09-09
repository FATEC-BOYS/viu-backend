import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Bloqueio de escrita para quem não confirmou o e-mail.
 *
 * Sobe desligado de propósito: com ele ligado antes de o e-mail estar
 * chegando de verdade, ninguém consegue começar a usar o produto e a tela não
 * tem como explicar por quê. Estes testes fixam os dois estados da flag, e o
 * detalhe que faz o botão "Já verifiquei" funcionar — a decisão vem do banco,
 * não do token.
 */

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  return { default: criarPrismaMock() }
})

const envFalso = vi.hoisted(() => ({ EXIGIR_EMAIL_VERIFICADO: false }))
vi.mock('../../src/config/env.js', () => ({ env: envFalso }))

import prisma from '../../src/database/client.js'
import { requireEmailVerificado } from '../../src/middleware/emailVerificadoMiddleware.js'

function pedido(usuario: unknown = { id: 'u1', email: 'a@b.com' }) {
  return { usuario } as any
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
  envFalso.EXIGIR_EMAIL_VERIFICADO = false
})

describe('flag desligada', () => {
  it('deixa passar mesmo sem verificação, e não consulta o banco', async () => {
    const reply = resposta()
    await requireEmailVerificado(pedido(), reply)

    expect(reply.statusCode).toBe(200)
    expect(prisma.usuario.findUnique).not.toHaveBeenCalled()
  })
})

describe('flag ligada', () => {
  beforeEach(() => { envFalso.EXIGIR_EMAIL_VERIFICADO = true })

  it('recusa com código que a interface reconhece', async () => {
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue({ emailVerificado: false } as never)

    const reply = resposta()
    await requireEmailVerificado(pedido(), reply)

    expect(reply.statusCode).toBe(403)
    expect(reply.body.codigo).toBe('EMAIL_NAO_VERIFICADO')
    expect(reply.body.message).toMatch(/confirme seu e-mail/i)
  })

  it('deixa passar quem já confirmou', async () => {
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue({ emailVerificado: true } as never)

    const reply = resposta()
    await requireEmailVerificado(pedido(), reply)

    expect(reply.statusCode).toBe(200)
  })

  /**
   * O token é uma fotografia do momento em que foi emitido. Se a decisão
   * saísse dele, quem confirmasse o e-mail agora continuaria bloqueado até a
   * sessão renovar — e o "Já verifiquei" da tela não teria efeito nenhum.
   */
  it('lê o estado atual no banco, não o que veio na sessão', async () => {
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue({ emailVerificado: true } as never)

    const reply = resposta()
    await requireEmailVerificado(pedido({ id: 'u1', emailVerificado: false }), reply)

    expect(prisma.usuario.findUnique).toHaveBeenCalledWith({
      where: { id: 'u1' },
      select: { emailVerificado: true },
    })
    expect(reply.statusCode).toBe(200)
  })

  /** Sem sessão quem responde é o authenticate — não é papel deste middleware. */
  it('não responde quando não há usuário na requisição', async () => {
    const reply = resposta()
    await requireEmailVerificado({} as any, reply)

    expect(reply.statusCode).toBe(200)
    expect(prisma.usuario.findUnique).not.toHaveBeenCalled()
  })
})
