import { FastifyRequest, FastifyReply } from 'fastify'
import { processarWebhookAsync, listarPagamentos } from '../services/pagamentoService.js'
import { validateMpWebhookSignature } from '../services/mercadoPagoService.js'

export async function webhookPagamentoHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const body = request.body as any
  const xSignature = (request.headers['x-signature'] as string) ?? ''
  const xRequestId = (request.headers['x-request-id'] as string) ?? ''
  const dataId = body?.data?.id ?? body?.id ?? ''

  if (!validateMpWebhookSignature(xSignature, xRequestId, dataId)) {
    reply.status(401).send({ message: 'Assinatura inválida', success: false })
    return
  }

  // Responde 200 imediatamente — o MP retry em qualquer falha de resposta e isso
  // causaria processamento duplicado. A deduplicação real é feita via WebhookLog.
  reply.status(200).send({ success: true })

  if (body?.type === 'payment' && body?.data?.id) {
    // externalId = x-request-id é a chave de idempotência recomendada pelo MP.
    // Fallback para data.id caso o header não venha (dev/sandbox sem x-request-id).
    const externalId = xRequestId || `mp-payment-${dataId}`
    setImmediate(() => {
      processarWebhookAsync(externalId, 'payment', String(body.data.id), body).catch(
        (err) => console.error('[webhook] Erro inesperado no processamento:', err),
      )
    })
  }
}

export async function listarPagamentosHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const pagamentos = await listarPagamentos(usuario.id)
    reply.send({ data: pagamentos, success: true })
  } catch {
    reply.status(500).send({ message: 'Erro ao buscar pagamentos', success: false })
  }
}
