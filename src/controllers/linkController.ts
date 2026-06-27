import { FastifyRequest, FastifyReply } from 'fastify'
import { LinkService } from '../services/linkService.js'
import { FeedbackService } from '../services/feedbackService.js'
import { env } from '../config/env.js'

const linkService = new LinkService()
const feedbackService = new FeedbackService()

export async function createSharedLink(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    if (!usuario?.id) {
      reply.status(401).send({ message: 'Usuário não autenticado', success: false })
      return
    }

    const data = request.body as {
      arteId: string
      expiraEm?: string
      somenteLeitura?: boolean
    }

    const link = await linkService.createSharedLink({
      arteId: data.arteId,
      expiraEm: data.expiraEm,
      somenteLeitura: data.somenteLeitura ?? true,
    })

    // Aponta para o viewer no FRONTEND, não para o backend
    const url = `${env.FRONTEND_URL}/viewer/${link.token}`

    reply.status(201).send({
      message: 'Link compartilhado criado com sucesso',
      data: { url, token: link.token },
      success: true,
    })
  } catch (error: any) {
    if (error.message.includes('não encontrad')) {
      reply.status(400).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({ message: 'Erro ao criar link compartilhado', success: false })
  }
}

/**
 * POST /links/:token/feedbacks — cria feedback via link compartilhado (requer auth)
 * Body JSON: { conteudo, tipo?, posicaoX?, posicaoY? }
 */
export async function createFeedbackViaLink(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { token } = request.params as { token: string }
    const arteId = await linkService.resolveArteIdFromToken(token)
    const body = request.body as any

    const feedback = await feedbackService.createFeedback({
      conteudo: body.conteudo ?? '',
      tipo: body.tipo ?? 'TEXTO',
      arteId,
      autorId: usuario.id,
      posicaoX: body.posicaoX ?? null,
      posicaoY: body.posicaoY ?? null,
    })

    reply.status(201).send({ message: 'Feedback criado', data: feedback, success: true })
  } catch (error: any) {
    if (error.message.includes('inválido') || error.message.includes('expirado') || error.message.includes('não encontrad')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({ message: 'Erro ao criar feedback', success: false })
  }
}

/**
 * POST /links/:token/feedbacks/audio — multipart, requer auth
 * Fields: audio (file), posicaoX?, posicaoY?
 */
export async function createAudioFeedbackViaLink(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { token } = request.params as { token: string }
    const arteId = await linkService.resolveArteIdFromToken(token)
    const audioData = (request as any).audioData

    if (!audioData) {
      reply.status(400).send({ message: 'Arquivo de áudio é obrigatório', success: false })
      return
    }

    const fields = audioData.fields as Record<string, any> | undefined
    const posicaoX = fields?.posicaoX?.value ? parseFloat(fields.posicaoX.value) : undefined
    const posicaoY = fields?.posicaoY?.value ? parseFloat(fields.posicaoY.value) : undefined

    const feedback = await feedbackService.createFeedbackComAudio({
      arteId,
      autorId: usuario.id,
      audioBuffer: audioData.buffer,
      filename: audioData.filename,
      posicaoX,
      posicaoY,
    })

    reply.status(201).send({ message: 'Feedback com áudio criado', data: feedback, success: true })
  } catch (error: any) {
    if (error.message.includes('inválido') || error.message.includes('expirado') || error.message.includes('não encontrad')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    if (error.message.includes('OPENAI_API_KEY')) {
      reply.status(503).send({ message: 'Serviço de transcrição não configurado', success: false })
      return
    }
    reply.status(500).send({ message: 'Erro ao criar feedback com áudio', success: false })
  }
}

export async function getPreviewByToken(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const { token } = request.params as { token: string }
    const preview = await linkService.getPreviewByToken(token)
    reply.send({ data: preview, success: true })
  } catch (error: any) {
    // Sempre 404 para não revelar se o token existe mas está expirado (S-08)
    if (
      error.message.includes('inválido') ||
      error.message.includes('expirado') ||
      error.message.includes('não encontrad')
    ) {
      reply.status(404).send({ message: 'Link não encontrado', success: false })
      return
    }
    reply.status(500).send({ message: 'Erro ao buscar preview', success: false })
  }
}
