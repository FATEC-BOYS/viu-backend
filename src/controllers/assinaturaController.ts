import { FastifyRequest, FastifyReply } from 'fastify'
import {
  getMinhaAssinatura,
  criarAssinatura,
  cancelarAssinatura,
  handleWebhookAssinatura,
} from '../services/assinaturaService.js'
import { validateMpWebhookSignature } from '../services/mercadoPagoService.js'

export async function getMinhaAssinaturaHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const assinatura = await getMinhaAssinatura(usuario.id)
    reply.send({ data: assinatura, success: true })
  } catch {
    reply.status(500).send({ message: 'Erro ao buscar assinatura', success: false })
  }
}

export async function criarAssinaturaHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { planoId } = request.body as { planoId: string }
    const result = await criarAssinatura(usuario.id, planoId, usuario.email)
    reply.status(201).send({ data: result, success: true })
  } catch (error: any) {
    if (error.message.includes('já possui')) {
      reply.status(409).send({ message: error.message, success: false })
      return
    }
    if (error.message.includes('não encontrado') || error.message.includes('inativo')) {
      reply.status(400).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({ message: 'Erro ao criar assinatura', success: false })
  }
}

export async function cancelarAssinaturaHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { id } = request.params as { id: string }
    await cancelarAssinatura(id, usuario.id)
    reply.send({ message: 'Assinatura cancelada com sucesso', success: true })
  } catch (error: any) {
    if (error.message.includes('não encontrada') || error.message.includes('não pertence')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({ message: 'Erro ao cancelar assinatura', success: false })
  }
}

export async function webhookAssinaturaHandler(
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

    if (body?.data?.id) {
      await handleWebhookAssinatura(String(body.data.id))
    }

    reply.status(200).send({ success: true })
  } catch {
    reply.status(500).send({ message: 'Erro ao processar webhook', success: false })
  }
}
