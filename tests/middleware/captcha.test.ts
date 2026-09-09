import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * O widget no navegador não prova nada: quem chama a API direto não carrega
 * widget nenhum. O que vale é esta verificação contra o siteverify da
 * Cloudflare — e é ela que estes testes fixam, incluindo o que acontece
 * quando a Cloudflare não responde.
 */

const envFalso = vi.hoisted(() => ({
  CAPTCHA_ENABLED: false,
  TURNSTILE_SECRET_KEY: 'segredo-de-teste',
}))
vi.mock('../../src/config/env.js', () => ({ env: envFalso }))

import { verificarCaptchaDoCadastro } from '../../src/middleware/captchaMiddleware.js'

function pedido(body: unknown) {
  return { body, ip: '203.0.113.10', log: { warn: vi.fn() } } as any
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

function responderSiteverify(corpo: unknown) {
  return vi.fn().mockResolvedValue({ json: async () => corpo } as any)
}

beforeEach(() => {
  vi.clearAllMocks()
  envFalso.CAPTCHA_ENABLED = false
  envFalso.TURNSTILE_SECRET_KEY = 'segredo-de-teste'
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('captcha desligado', () => {
  /** É assim que se desenvolve local: sem chave, sem domínio, sem widget. */
  it('deixa o cadastro passar sem token e nem consulta a Cloudflare', async () => {
    const chamada = vi.fn()
    vi.stubGlobal('fetch', chamada)

    const reply = resposta()
    await verificarCaptchaDoCadastro(pedido({ email: 'a@b.com' }), reply)

    expect(reply.statusCode).toBe(200)
    expect(chamada).not.toHaveBeenCalled()
  })
})

describe('captcha ligado', () => {
  beforeEach(() => { envFalso.CAPTCHA_ENABLED = true })

  it('recusa cadastro sem token', async () => {
    const reply = resposta()
    await verificarCaptchaDoCadastro(pedido({ email: 'a@b.com' }), reply)

    expect(reply.statusCode).toBe(400)
    expect(reply.body.message).toMatch(/não é um robô/i)
  })

  it('aceita token que a Cloudflare confirma', async () => {
    vi.stubGlobal('fetch', responderSiteverify({ success: true }))

    const reply = resposta()
    await verificarCaptchaDoCadastro(pedido({ captchaToken: 'tok' }), reply)

    expect(reply.statusCode).toBe(200)
  })

  it('recusa token que a Cloudflare rejeita', async () => {
    vi.stubGlobal('fetch', responderSiteverify({ success: false, 'error-codes': ['invalid-input-response'] }))

    const reply = resposta()
    await verificarCaptchaDoCadastro(pedido({ captchaToken: 'tok-falso' }), reply)

    expect(reply.statusCode).toBe(400)
  })

  it('manda o segredo e o IP de quem chamou, nunca a site key', async () => {
    const chamada = responderSiteverify({ success: true })
    vi.stubGlobal('fetch', chamada)

    await verificarCaptchaDoCadastro(pedido({ captchaToken: 'tok' }), resposta())

    const [, opcoes] = chamada.mock.calls[0] as [string, any]
    const enviado = opcoes.body as URLSearchParams
    expect(enviado.get('secret')).toBe('segredo-de-teste')
    expect(enviado.get('response')).toBe('tok')
    expect(enviado.get('remoteip')).toBe('203.0.113.10')
  })

  /**
   * Escolha explícita: Cloudflare fora do ar não derruba o cadastro do produto
   * inteiro. Quem segura volume é o limite por IP, que continua de pé atrás
   * disto; o captcha só encarece o caso individual.
   */
  it('deixa passar quando o siteverify não responde', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')))

    const reply = resposta()
    await verificarCaptchaDoCadastro(pedido({ captchaToken: 'tok' }), reply)

    expect(reply.statusCode).toBe(200)
  })
})
