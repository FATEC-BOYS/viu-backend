import { FastifyRequest, FastifyReply } from 'fastify'
import { FeedbackService, ListFeedbacksParams } from '../services/feedbackService.js'
import { signPath } from '../utils/storage.js'
import { getAccessibleProjectIds } from '../utils/projectAccess.js'
import { erroInterno } from '../utils/erroInterno.js'

const feedbackService = new FeedbackService()

export async function listFeedbacks(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { page = 1, limit = 10, arteId, autorId, tipo, status, search } = (request.query || {}) as any
    const params: ListFeedbacksParams = {
      page: Number(page) || 1,
      limit: Number(limit) || 10,
      arteId: arteId as string | undefined,
      autorId: autorId as string | undefined,
      tipo: tipo as string | undefined,
      status: status as string | undefined,
      search: search as string | undefined,
    }

    const acessiveis = await getAccessibleProjectIds(usuario.id, usuario.tipo === 'ADMIN')
    if (acessiveis) params.projetoIds = acessiveis

    const { feedbacks, total } = await feedbackService.listFeedbacks(params)
    const feedbacksComUrl = await Promise.all(
      feedbacks.map(async (fb: any) => ({
        ...fb,
        arquivo_url: fb.tipo === 'AUDIO' && fb.arquivo ? await signPath(fb.arquivo) : null,
        arte_preview_url: fb.arte?.arquivo ? await signPath(fb.arte.arquivo, 3600) : null,
      })),
    )
    reply.send({
      data: feedbacksComUrl,
      pagination: { page: params.page, limit: params.limit, total, pages: Math.ceil(total / params.limit!) },
      success: true,
    })
  } catch (erro) {
    request.log.error({ erro }, 'Erro ao listar feedbacks')
    reply.status(500).send({ message: 'Erro ao listar feedbacks', success: false })
  }
}

export async function getFeedbackById(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const { id } = request.params as { id: string }
    const feedback = await feedbackService.getFeedbackById(id)
    if (!feedback) {
      reply.status(404).send({ message: 'Feedback não encontrado', success: false })
      return
    }
    const arquivo_url =
      feedback.tipo === 'AUDIO' && feedback.arquivo ? await signPath(feedback.arquivo) : null
    reply.send({ data: { ...feedback, arquivo_url }, success: true })
  } catch (erro) {
    request.log.error({ erro }, 'Erro ao buscar feedback')
    reply.status(500).send({ message: 'Erro ao buscar feedback', success: false })
  }
}

export async function createFeedback(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const body = request.body as any
    // Whitelist fields — autorId always comes from authenticated session
    const data = {
      conteudo: body.conteudo,
      tipo: body.tipo ?? 'TEXTO',
      arteId: body.arteId,
      posicaoX: body.posicaoX,
      posicaoY: body.posicaoY,
      autorId: usuario.id,
      parentId: body.parentId,
    }
    const feedback = await feedbackService.createFeedback(data, {
      via: 'projeto',
      isAdmin: usuario.tipo === 'ADMIN',
    })
    reply.status(201).send({ message: 'Feedback criado com sucesso', data: feedback, success: true })
  } catch (error: any) {
    if (error.message.includes('Acesso negado')) {
      reply.status(403).send({ message: error.message, success: false })
      return
    }
    if (error.message.includes('não encontrad')) {
      reply.status(400).send({ message: error.message, success: false })
      return
    }
    erroInterno(request, reply, error, 'Erro ao criar feedback')
  }
}

/**
 * POST /feedbacks/audio — multipart/form-data
 * Fields: audio (file), arteId, posicaoX?, posicaoY?
 * validateAudioUpload reads the stream first and populates request.audioData
 */
export async function createFeedbackComAudio(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    if (!usuario?.id) {
      reply.status(401).send({ message: 'Usuário não autenticado', success: false })
      return
    }

    const audioData = (request as any).audioData
    if (!audioData) {
      reply.status(400).send({ message: 'Arquivo de áudio é obrigatório', success: false })
      return
    }

    const fields = audioData.fields as Record<string, any> | undefined
    const arteId = fields?.arteId?.value as string | undefined
    if (!arteId) {
      reply.status(400).send({ message: 'arteId é obrigatório', success: false })
      return
    }

    const posicaoX = fields?.posicaoX?.value ? parseFloat(fields.posicaoX.value) : undefined
    const posicaoY = fields?.posicaoY?.value ? parseFloat(fields.posicaoY.value) : undefined

    const feedback = await feedbackService.createFeedbackComAudio({
      origem: { via: 'projeto', isAdmin: usuario.tipo === 'ADMIN' },
      arteId,
      autorId: usuario.id,
      audioBuffer: audioData.buffer,
      filename: audioData.filename,
      posicaoX,
      posicaoY,
    })

    reply.status(201).send({
      message: 'Feedback com áudio criado e transcrito com sucesso',
      data: feedback,
      success: true,
    })
  } catch (error: any) {
    if (error.message.includes('não encontrad')) {
      reply.status(400).send({ message: error.message, success: false })
      return
    }
    if (error.message.includes('OPENAI_API_KEY')) {
      reply.status(503).send({ message: 'Serviço de transcrição não configurado', success: false })
      return
    }
    erroInterno(request, reply, error, 'Erro ao criar feedback com áudio')
  }
}

export async function getFeedbackAudio(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const { id } = request.params as { id: string }
    const { buffer } = await feedbackService.gerarAudioDoFeedback(id)
    reply
      .header('Content-Type', 'audio/mpeg')
      .header('Content-Disposition', `inline; filename="feedback-${id}.mp3"`)
      .send(buffer)
  } catch (error: any) {
    if (error.message.includes('não encontrado')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    if (error.message.includes('não possui conteúdo')) {
      reply.status(400).send({ message: error.message, success: false })
      return
    }
    if (error.message.includes('OPENAI_API_KEY')) {
      reply.status(503).send({ message: 'Serviço de síntese não configurado', success: false })
      return
    }
    erroInterno(request, reply, error, 'Erro ao gerar áudio do feedback')
  }
}

export async function getFeedbackTranscricao(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const { id } = request.params as { id: string }
    const transcricao = await feedbackService.getTranscricao(id)
    reply.send({ data: { transcricao }, success: true })
  } catch (error: any) {
    if (error.message.includes('não encontrado')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    if (error.message.includes('não possui áudio')) {
      reply.status(400).send({ message: error.message, success: false })
      return
    }
    erroInterno(request, reply, error, 'Erro ao obter transcrição')
  }
}

export async function updateFeedback(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const { id } = request.params as { id: string }
    const feedback = await feedbackService.updateFeedback(id, request.body)
    reply.send({ message: 'Feedback atualizado com sucesso', data: feedback, success: true })
  } catch (error: any) {
    if (error.message.includes('Feedback não encontrado')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    erroInterno(request, reply, error, 'Erro ao atualizar feedback')
  }
}

export async function deleteFeedback(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const { id } = request.params as { id: string }
    await feedbackService.deleteFeedback(id)
    reply.send({ message: 'Feedback removido com sucesso', success: true })
  } catch (error: any) {
    if (error.message.includes('Feedback não encontrado')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    erroInterno(request, reply, error, 'Erro ao remover feedback')
  }
}

export async function resolverThread(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const { id } = request.params as { id: string }
    const usuario = (request as any).usuario
    const feedback = await feedbackService.resolverThread(
      id,
      usuario.id,
      usuario.tipo === 'ADMIN',
    )
    reply.send({ message: 'Thread resolvida com sucesso', data: feedback, success: true })
  } catch (error: any) {
    if (error.message.includes('Acesso negado')) {
      reply.status(403).send({ message: error.message, success: false })
      return
    }
    if (error.message.includes('não encontrado')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    if (error.message.includes('já está resolvida')) {
      reply.status(409).send({ message: error.message, success: false })
      return
    }
    erroInterno(request, reply, error, 'Erro ao resolver thread')
  }
}

export async function reabrirThread(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { id } = request.params as { id: string }
    const feedback = await feedbackService.reabrirThread(
      id,
      usuario.id,
      usuario.tipo === 'ADMIN',
    )
    reply.send({ message: 'Thread reaberta com sucesso', data: feedback, success: true })
  } catch (error: any) {
    if (error.message.includes('Acesso negado')) {
      reply.status(403).send({ message: error.message, success: false })
      return
    }
    if (error.message.includes('não encontrado')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    if (error.message.includes('não está resolvida')) {
      reply.status(409).send({ message: error.message, success: false })
      return
    }
    erroInterno(request, reply, error, 'Erro ao reabrir thread')
  }
}
