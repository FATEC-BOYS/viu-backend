import { FastifyRequest, FastifyReply } from 'fastify'
import { handleWebhookPagamento, listarPagamentos } from '../services/pagamentoService.js'
import { validateMpWebhookSignature } from '../services/mercadoPagoService.js'

export async function webhookPagamentoHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const body = request.body as any
    const xSignature = (request.headers['x-signature'] as string) ?? ''
    const xRequestId = (request.headers['x-request-id'] as string) ?? ''
    const dataId = body?.data?.id ?? body?.id ?? ''

    if (!validateMpWebhookSignature(xSignature, xRequestId, dataId)) {
      reply.status(401).send({ message: 'Assinatura inválida', success: false })
      return
    }

    if (body?.type === 'payment' && body?.data?.id) {
      await handleWebhookPagamento(String(body.data.id))
    }

    reply.status(200).send({ success: true })
  } catch {
    reply.status(500).send({ message: 'Erro ao processar webhook', success: false })
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
