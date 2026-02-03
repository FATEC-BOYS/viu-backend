// src/controllers/feedbackController.ts
/**
 * Controladores de Feedbacks
 *
 * Processa requisições HTTP relacionadas a feedbacks, delegando a
 * lógica de negócio ao serviço de feedbacks. Inclui endpoints para
 * upload de áudio com transcrição (STT) e geração de voz (TTS).
 */

import { FastifyRequest, FastifyReply } from 'fastify'
import { FeedbackService, ListFeedbacksParams } from '../services/feedbackService.js'
import { signPath } from '../utils/supabaseStorage.js'

const feedbackService = new FeedbackService()

export async function listFeedbacks(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const { page = 1, limit = 10, arteId, autorId, tipo } = (request.query || {}) as any
    const params: ListFeedbacksParams = {
      page: Number(page) || 1,
      limit: Number(limit) || 10,
      arteId: arteId as string | undefined,
      autorId: autorId as string | undefined,
      tipo: tipo as string | undefined,
    }
    const { feedbacks, total } = await feedbackService.listFeedbacks(params)

    // Assina URLs de áudio nos feedbacks
    const feedbacksComUrl = await Promise.all(
      feedbacks.map(async (fb: any) => {
        const arquivo_url = fb.tipo === 'AUDIO' && fb.arquivo
          ? await signPath(fb.arquivo)
          : null
        return { ...fb, arquivo_url }
      })
    )

    reply.send({
      data: feedbacksComUrl,
      pagination: {
        page: params.page,
        limit: params.limit,
        total,
        pages: Math.ceil(total / params.limit!),
      },
      success: true,
    })
  } catch (error: any) {
    reply.status(500).send({
      message: 'Erro ao listar feedbacks',
      error: error.message,
      success: false,
    })
  }
}

export async function getFeedbackById(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const { id } = request.params as { id: string }
    const feedback = await feedbackService.getFeedbackById(id)
    if (!feedback) {
      reply.status(404).send({ message: 'Feedback não encontrado', success: false })
      return
    }
    
    // Assina URL de áudio se for feedback de áudio
    const arquivo_url = feedback.tipo === 'AUDIO' && feedback.arquivo 
      ? await signPath(feedback.arquivo) 
      : null
    
    reply.send({ 
      data: { ...feedback, arquivo_url }, 
      success: true 
    })
  } catch (error: any) {
    reply.status(500).send({
      message: 'Erro ao buscar feedback',
      error: error.message,
      success: false,
    })
  }
}

export async function createFeedback(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const data = {
      ...(request.body as Record<string, any>),
      autorId: usuario?.id,
    }
    const feedback = await feedbackService.createFeedback(data)
    reply.status(201).send({
      message: 'Feedback criado com sucesso',
      data: feedback,
      success: true,
    })
  } catch (error: any) {
    if (error.message.includes('Arte não encontrada') || error.message.includes('Autor não encontrado')) {
      reply.status(400).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({
      message: 'Erro ao criar feedback',
      error: error.message,
      success: false,
    })
  }
}

/**
 * POST /feedbacks/audio
 * Content-Type: multipart/form-data
 *
 * Campos do form:
 *   - audio: arquivo de áudio (webm, ogg, mp3, wav, m4a)
 *   - arteId: ID da arte
 *   - posicaoX: (opcional) coordenada X do ponto clicado
 *   - posicaoY: (opcional) coordenada Y do ponto clicado
 *
 * Fluxo:
 *   1. Recebe áudio via multipart
 *   2. Upload no Supabase Storage
 *   3. Transcreve via Whisper (OpenAI)
 *   4. Salva feedback com texto transcrito + URL do áudio + posição
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

    // Usa os dados já validados pelo middleware
    const audioData = (request as any).audioData
    if (!audioData) {
      reply.status(400).send({ message: 'Arquivo de áudio é obrigatório', success: false })
      return
    }

    // Busca os campos do form
    const data = await request.file()
    const fields = data?.fields as Record<string, any> | undefined

    const arteId = fields?.arteId?.value as string | undefined
    if (!arteId) {
      reply.status(400).send({ message: 'arteId é obrigatório', success: false })
      return
    }

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
    reply.status(500).send({
      message: 'Erro ao criar feedback com áudio',
      error: error.message,
      success: false,
    })
  }
}

/**
 * GET /feedbacks/:id/audio
 *
 * Gera áudio TTS a partir do conteúdo textual de um feedback.
 * Retorna o stream de áudio MP3 diretamente.
 */
export async function getFeedbackAudio(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
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
    reply.status(500).send({
      message: 'Erro ao gerar áudio do feedback',
      error: error.message,
      success: false,
    })
  }
}

/**
 * GET /feedbacks/:id/transcricao
 *
 * Retorna a transcrição de um feedback de áudio.
 */
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
    reply.status(500).send({
      message: 'Erro ao obter transcrição',
      error: error.message,
      success: false,
    })
  }
}

export async function updateFeedback(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const { id } = request.params as { id: string }
    const updateData = request.body
    const feedback = await feedbackService.updateFeedback(id, updateData)
    reply.send({
      message: 'Feedback atualizado com sucesso',
      data: feedback,
      success: true,
    })
  } catch (error: any) {
    if (error.message.includes('Feedback não encontrado')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({
      message: 'Erro ao atualizar feedback',
      error: error.message,
      success: false,
    })
  }
}

export async function deleteFeedback(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const { id } = request.params as { id: string }
    await feedbackService.deleteFeedback(id)
    reply.send({ message: 'Feedback removido com sucesso', success: true })
  } catch (error: any) {
    if (error.message.includes('Feedback não encontrado')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({
      message: 'Erro ao remover feedback',
      error: error.message,
      success: false,
    })
  }
}
