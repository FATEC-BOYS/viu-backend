import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHmac } from 'crypto'

vi.mock('../../src/config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    WHATSAPP_ACCESS_TOKEN: 'test-token',
    WHATSAPP_PHONE_NUMBER_ID: '123456789',
    WHATSAPP_APP_SECRET: 'test-app-secret',
    WHATSAPP_VERIFY_TOKEN: 'verify-me',
    WHATSAPP_API_VERSION: 'v21.0',
  },
}))

vi.mock('axios', () => ({
  default: { post: vi.fn(), get: vi.fn() },
}))

import axios from 'axios'
import {
  isWhatsAppConfigured,
  validateWhatsAppSignature,
  enviarSolicitacaoAprovacao,
  enviarConfirmacaoAprovacao,
} from '../../src/services/whatsappService.js'

beforeEach(() => vi.clearAllMocks())

// ─── validateWhatsAppSignature ─────────────────────────────────────────────

describe('validateWhatsAppSignature', () => {
  const body = Buffer.from(JSON.stringify({ object: 'whatsapp_business_account' }))

  it('aceita assinatura HMAC-SHA256 correta', () => {
    const hash = createHmac('sha256', 'test-app-secret').update(body).digest('hex')
    expect(validateWhatsAppSignature(body, `sha256=${hash}`)).toBe(true)
  })

  it('rejeita assinatura incorreta', () => {
    expect(validateWhatsAppSignature(body, `sha256=${'0'.repeat(64)}`)).toBe(false)
  })

  it('rejeita header sem o prefixo sha256=', () => {
    const hash = createHmac('sha256', 'test-app-secret').update(body).digest('hex')
    expect(validateWhatsAppSignature(body, hash)).toBe(false)
  })

  it('rejeita corpo adulterado após a assinatura', () => {
    const hash = createHmac('sha256', 'test-app-secret').update(body).digest('hex')
    const adulterado = Buffer.from(JSON.stringify({ object: 'outra_coisa' }))
    expect(validateWhatsAppSignature(adulterado, `sha256=${hash}`)).toBe(false)
  })
})

// ─── Envio de cards interativos ────────────────────────────────────────────

describe('envio de mensagens interativas', () => {
  it('isWhatsAppConfigured retorna true com token e phone id', () => {
    expect(isWhatsAppConfigured()).toBe(true)
  })

  it('card de solicitação leva botões aprovar/alterar com o envioId', async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: { messages: [{ id: 'wamid.ABC' }] } })

    const wamid = await enviarSolicitacaoAprovacao('5511999999999', {
      envioId: 'env123',
      arteNome: 'Post Black Friday',
      versao: 3,
    })

    expect(wamid).toBe('wamid.ABC')
    const [url, payload] = vi.mocked(axios.post).mock.calls[0]
    expect(url).toContain('/123456789/messages')
    const botoes = (payload as any).interactive.action.buttons
    expect(botoes.map((b: any) => b.reply.id)).toEqual(['aprovar:env123', 'alterar:env123'])
  })

  it('card de confirmação usa botão confirmar (Princípio nº 3)', async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: { messages: [{ id: 'wamid.DEF' }] } })

    await enviarConfirmacaoAprovacao('5511999999999', {
      envioId: 'env123',
      arteNome: 'Post Black Friday',
      versao: 3,
    })

    const [, payload] = vi.mocked(axios.post).mock.calls[0]
    const botoes = (payload as any).interactive.action.buttons
    expect(botoes.map((b: any) => b.reply.id)).toEqual(['confirmar:env123', 'alterar:env123'])
  })
})
