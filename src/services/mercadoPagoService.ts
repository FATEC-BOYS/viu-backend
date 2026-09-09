import { MercadoPagoConfig, Payment, PreApproval } from 'mercadopago'
import { createHmac } from 'crypto'
import { env } from '../config/env.js'

const client = new MercadoPagoConfig({
  accessToken: env.MP_ACCESS_TOKEN,
  options: { timeout: 5000 },
})

export const mpPayment = new Payment(client)
export const mpPreApproval = new PreApproval(client)

/**
 * Valida a assinatura do webhook do MercadoPago usando HMAC-SHA256.
 * Formato do header x-signature: ts=<timestamp>,v1=<hash>
 */
export function validateMpWebhookSignature(
  xSignature: string,
  xRequestId: string,
  dataId: string,
): boolean {
  // Sem segredo não há como distinguir uma notificação do MercadoPago de uma
  // forjada por quem descobriu a URL — e uma forjada marca fatura como paga.
  // Antes isto devolvia `true` "em dev", o que significava aceitar tudo em
  // qualquer ambiente onde a variável estivesse vazia. Recusar é a única
  // resposta honesta: com a cobrança desligada não há webhook legítimo para
  // receber, e com ela ligada a validação do env garante que o segredo existe.
  if (!env.MP_WEBHOOK_SECRET) return false

  const parts = Object.fromEntries(
    xSignature.split(',').map((part) => {
      const [k, v] = part.split('=')
      return [k?.trim() ?? '', v?.trim() ?? '']
    }),
  ) as Record<string, string>

  const ts = parts['ts']
  const v1 = parts['v1']
  if (!ts || !v1) return false

  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`
  const hash = createHmac('sha256', env.MP_WEBHOOK_SECRET).update(manifest).digest('hex')
  return hash === v1
}
