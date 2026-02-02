// src/services/feedbackService.ts
/**
 * Serviço de Feedbacks
 *
 * Fornece operações CRUD para feedbacks associados às artes. Inclui
 * verificação de relacionamento com arte e autor, criação de feedback
 * com áudio (upload + transcrição) e geração de áudio a partir de texto (TTS).
 */

import prisma from '../database/client.js'
import { supa } from '../supabaseAdmin.js'
import { transcreverAudio, sintetizarTexto } from './transcricaoService.js'

export interface ListFeedbacksParams {
  page?: number
  limit?: number
  arteId?: string
  autorId?: string
  tipo?: string
}

export class FeedbackService {
  async listFeedbacks({
    page = 1,
    limit = 10,
    arteId,
    autorId,
    tipo,
  }: ListFeedbacksParams) {
    const skip = (page - 1) * limit
    const where: any = {
      ...(arteId && { arteId }),
      ...(autorId && { autorId }),
      ...(tipo && { tipo }),
    }
    const [feedbacks, total] = await Promise.all([
      prisma.feedback.findMany({
        where,
        skip,
        take: Number(limit),
        include: {
          autor: { select: { id: true, nome: true, avatar: true } },
          arte: { select: { id: true, nome: true } },
        },
        orderBy: { criadoEm: 'desc' },
      }),
      prisma.feedback.count({ where }),
    ])
    return { feedbacks, total }
  }

  async getFeedbackById(id: string) {
    return prisma.feedback.findUnique({
      where: { id },
      include: {
        autor: { select: { id: true, nome: true, avatar: true } },
        arte: { select: { id: true, nome: true } },
      },
    })
  }

  async createFeedback(data: any) {
    const [arte, autor] = await Promise.all([
      prisma.arte.findUnique({ where: { id: data.arteId } }),
      prisma.usuario.findUnique({ where: { id: data.autorId } }),
    ])
    if (!arte) throw new Error('Arte não encontrada')
    if (!autor) throw new Error('Autor não encontrado')
    return prisma.feedback.create({ data })
  }

  /**
   * Cria feedback posicional com áudio: faz upload do arquivo no Supabase Storage,
   * transcreve o áudio via Whisper e salva tudo no banco.
   */
  async createFeedbackComAudio(params: {
    arteId: string
    autorId: string
    audioBuffer: Buffer
    filename: string
    posicaoX?: number
    posicaoY?: number
  }) {
    const { arteId, autorId, audioBuffer, filename, posicaoX, posicaoY } = params

    const [arte, autor] = await Promise.all([
      prisma.arte.findUnique({ where: { id: arteId } }),
      prisma.usuario.findUnique({ where: { id: autorId } }),
    ])
    if (!arte) throw new Error('Arte não encontrada')
    if (!autor) throw new Error('Autor não encontrado')

    // 1. Upload do áudio no Supabase Storage
    const storagePath = `feedbacks/${arteId}/${Date.now()}_${filename}`
    const { error: uploadError } = await supa.storage
      .from('feedbacks-audio')
      .upload(storagePath, audioBuffer, {
        contentType: 'audio/webm',
        upsert: false,
      })
    if (uploadError) {
      throw new Error(`Erro no upload do áudio: ${uploadError.message}`)
    }

    const { data: urlData } = supa.storage
      .from('feedbacks-audio')
      .getPublicUrl(storagePath)

    // 2. Transcrever o áudio
    const transcricao = await transcreverAudio(audioBuffer, filename)

    // 3. Salvar feedback com todos os dados
    const tipo = posicaoX !== undefined && posicaoY !== undefined ? 'POSICIONAL' : 'AUDIO'

    return prisma.feedback.create({
      data: {
        conteudo: transcricao,
        tipo,
        arquivo: urlData.publicUrl,
        transcricao,
        posicaoX: posicaoX ?? null,
        posicaoY: posicaoY ?? null,
        arteId,
        autorId,
      },
      include: {
        autor: { select: { id: true, nome: true, avatar: true } },
        arte: { select: { id: true, nome: true } },
      },
    })
  }

  /**
   * Gera áudio TTS a partir do conteúdo textual de um feedback.
   * Se já existe um áudio gerado em cache (audioGerado), retorna a URL.
   * Caso contrário, gera, salva no Storage, atualiza o registro e retorna o buffer.
   */
  async gerarAudioDoFeedback(id: string): Promise<{ buffer: Buffer; feedback: any }> {
    const feedback = await prisma.feedback.findUnique({ where: { id } })
    if (!feedback) throw new Error('Feedback não encontrado')

    if (!feedback.conteudo || feedback.conteudo.trim().length === 0) {
      throw new Error('Feedback não possui conteúdo textual para sintetizar')
    }

    // Se já existe áudio gerado, baixar do Storage e retornar
    if (feedback.audioGerado) {
      const response = await fetch(feedback.audioGerado)
      if (response.ok) {
        const buffer = Buffer.from(await response.arrayBuffer())
        return { buffer, feedback }
      }
      // Se falhou ao buscar o cache, gera novamente
    }

    // Gerar áudio via TTS
    const audioBuffer = await sintetizarTexto(feedback.conteudo)

    // Upload no Supabase Storage
    const storagePath = `feedbacks-tts/${id}/${Date.now()}.mp3`
    const { error: uploadError } = await supa.storage
      .from('feedbacks-audio')
      .upload(storagePath, audioBuffer, {
        contentType: 'audio/mpeg',
        upsert: false,
      })

    let audioGeradoUrl: string | null = null
    if (!uploadError) {
      const { data: urlData } = supa.storage
        .from('feedbacks-audio')
        .getPublicUrl(storagePath)
      audioGeradoUrl = urlData.publicUrl

      // Atualizar o registro com a URL do áudio gerado (cache)
      await prisma.feedback.update({
        where: { id },
        data: { audioGerado: audioGeradoUrl },
      })
    }

    return { buffer: audioBuffer, feedback }
  }

  /**
   * Retorna a transcrição de um feedback de áudio.
   * Se não existe transcrição salva mas existe arquivo de áudio, tenta transcrever.
   */
  async getTranscricao(id: string): Promise<string> {
    const feedback = await prisma.feedback.findUnique({ where: { id } })
    if (!feedback) throw new Error('Feedback não encontrado')

    if (feedback.transcricao) return feedback.transcricao

    if (!feedback.arquivo) {
      throw new Error('Feedback não possui áudio para transcrever')
    }

    // Baixar o áudio e transcrever
    const response = await fetch(feedback.arquivo)
    if (!response.ok) throw new Error('Erro ao buscar arquivo de áudio')
    const audioBuffer = Buffer.from(await response.arrayBuffer())

    const transcricao = await transcreverAudio(audioBuffer)

    // Salvar a transcrição como cache
    await prisma.feedback.update({
      where: { id },
      data: { transcricao, conteudo: transcricao },
    })

    return transcricao
  }

  async updateFeedback(id: string, updateData: any) {
    const existing = await prisma.feedback.findUnique({ where: { id } })
    if (!existing) throw new Error('Feedback não encontrado')
    return prisma.feedback.update({ where: { id }, data: updateData })
  }

  async deleteFeedback(id: string) {
    const existing = await prisma.feedback.findUnique({ where: { id } })
    if (!existing) throw new Error('Feedback não encontrado')
    await prisma.feedback.delete({ where: { id } })
    return
  }
}
