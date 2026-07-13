import { FastifyRequest, FastifyReply } from 'fastify'
import { env } from '../config/env.js'
import { validateWhatsAppSignature } from '../services/whatsappService.js'
import { processarWebhookWhatsAppAsync } from '../services/whatsappWebhookService.js'
import {
  criarEnvioAprovacao,
  listarEnviosPorArte,
  WhatsAppEnvioError,
} from '../services/whatsappEnvioService.js'
import { WhatsAppWebhookPayload } from '../types/whatsapp.js'

/**
 * GET /webhooks/whatsapp — verificação do endpoint pela Meta.
 * Ao cadastrar o webhook no painel, a Meta faz um GET com hub.mode,
 * hub.verify_token e hub.challenge; devolvemos o challenge se o token bater.
 */
export async function verificarWebhookWhatsAppHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const query = request.query as Record<string, string>
  const mode = query['hub.mode']
  const token = query['hub.verify_token']
  const challenge = query['hub.challenge']

  if (mode === 'subscribe' && env.WHATSAPP_VERIFY_TOKEN && token === env.WHATSAPP_VERIFY_TOKEN) {
    reply.status(200).send(challenge)
    return
  }
  reply.status(403).send({ message: 'Token de verificação inválido', success: false })
}

/**
 * POST /webhooks/whatsapp — eventos de mensagens e statuses.
 * Valida X-Hub-Signature-256 sobre o corpo BRUTO, responde 200 imediatamente
 * (a Meta reenvia em timeout, o que causaria duplicação) e processa de forma
 * assíncrona. Deduplicação real por wamid via WebhookLog.
 */
export async function webhookWhatsAppHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const rawBody = (request as any).rawBody as Buffer | undefined
  const signature = (request.headers['x-hub-signature-256'] as string) ?? ''

  if (!rawBody || !validateWhatsAppSignature(rawBody, signature)) {
    reply.status(401).send({ message: 'Assinatura inválida', success: false })
    return
  }

  reply.status(200).send({ success: true })

  const payload = request.body as WhatsAppWebhookPayload
  if (payload?.object === 'whatsapp_business_account') {
    setImmediate(() => {
      processarWebhookWhatsAppAsync(payload).catch((err) =>
        console.error('[whatsapp] Erro inesperado no processamento do webhook:', err),
      )
    })
  }
}

/**
 * POST /whatsapp/envios — a agência dispara o card de aprovação para o
 * cliente do projeto da arte. Telefone sai do cadastro do cliente.
 */
export async function criarEnvioAprovacaoHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const usuario = (request as any).usuario
  const { arteId, linkPreview } = request.body as { arteId: string; linkPreview?: string }

  try {
    const envio = await criarEnvioAprovacao(usuario.id, usuario.tipo, arteId, linkPreview)
    reply.status(201).send({ data: envio, success: true })
  } catch (err) {
    if (err instanceof WhatsAppEnvioError) {
      reply.status(err.statusCode).send({ message: err.message, success: false })
      return
    }
    throw err
  }
}

/** GET /whatsapp/envios?arteId= — histórico de solicitações da arte. */
export async function listarEnviosHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const usuario = (request as any).usuario
  const { arteId } = request.query as { arteId?: string }
  if (!arteId) {
    reply.status(400).send({ message: 'arteId é obrigatório', success: false })
    return
  }

  try {
    const envios = await listarEnviosPorArte(usuario.id, usuario.tipo, arteId)
    reply.send({ data: envios, success: true })
  } catch (err) {
    if (err instanceof WhatsAppEnvioError) {
      reply.status(err.statusCode).send({ message: err.message, success: false })
      return
    }
    throw err
  }
}
