import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHmac } from 'crypto'

/**
 * Assinatura do webhook de pagamento.
 *
 * O caso que importa é o do segredo ausente. Antes a função devolvia `true`
 * ali — "em dev, aceita sem validar" — o que significava aceitar qualquer
 * requisição em qualquer ambiente onde a variável estivesse vazia. Como uma
 * notificação forjada marca fatura como paga, isso é dinheiro.
 */

const envFalso = vi.hoisted(() => ({ MP_ACCESS_TOKEN: 'tok', MP_WEBHOOK_SECRET: '' }))
vi.mock('../../src/config/env.js', () => ({ env: envFalso }))

import { validateMpWebhookSignature } from '../../src/services/mercadoPagoService.js'

const ID = '123456'
const REQ = 'req-abc'

function assinar(segredo: string, ts: string) {
  const manifest = `id:${ID};request-id:${REQ};ts:${ts};`
  return createHmac('sha256', segredo).update(manifest).digest('hex')
}

beforeEach(() => {
  envFalso.MP_WEBHOOK_SECRET = ''
})

it('recusa quando não há segredo configurado', () => {
  expect(validateMpWebhookSignature(`ts=1,v1=qualquercoisa`, REQ, ID)).toBe(false)
})

it('aceita assinatura válida', () => {
  envFalso.MP_WEBHOOK_SECRET = 'segredo'
  const ts = '1788900000'
  expect(validateMpWebhookSignature(`ts=${ts},v1=${assinar('segredo', ts)}`, REQ, ID)).toBe(true)
})

it('recusa assinatura de outro segredo', () => {
  envFalso.MP_WEBHOOK_SECRET = 'segredo'
  const ts = '1788900000'
  expect(validateMpWebhookSignature(`ts=${ts},v1=${assinar('outro', ts)}`, REQ, ID)).toBe(false)
})

it('recusa header malformado', () => {
  envFalso.MP_WEBHOOK_SECRET = 'segredo'
  expect(validateMpWebhookSignature('lixo', REQ, ID)).toBe(false)
  expect(validateMpWebhookSignature('', REQ, ID)).toBe(false)
})
