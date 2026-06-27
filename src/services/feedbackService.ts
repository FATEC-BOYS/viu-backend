import prisma from '../database/client.js'
import { uploadFile } from '../utils/storage.js'
import { transcreverAudio, sintetizarTexto } from './transcricaoService.js'

export interface ListFeedbacksParams {
  page?: number
  limit?: number
  arteId?: string
  autorId?: string
  tipo?: string
  status?: string
  search?: string
  projetoIds?: string[] // access-control scope (set by controller for non-admins)
}

export class FeedbackService {
  async listFeedbacks({ page = 1, limit = 10, arteId, autorId, tipo, status, search, projetoIds }: ListFeedbacksParams) {
    const skip = (page - 1) * limit
    const and: any[] = []
    if (arteId) and.push({ arteId })
    if (autorId) and.push({ autorId })
    if (tipo) and.push({ tipo })
    if (status) and.push({ status })
    if (projetoIds) and.push({ arte: { projetoId: { in: projetoIds } } })
    if (search) {
      and.push({
        OR: [
          { conteudo: { contains: search, mode: 'insensitive' } },
          { arte: { nome: { contains: search, mode: 'insensitive' } } },
        ],
      })
    }
    const where = and.length > 0 ? { AND: and } : {}
    const [feedbacks, total] = await Promise.all([
      prisma.feedback.findMany({
        where,
        skip,
        take: Number(limit),
        include: {
          autor: { select: { id: true, nome: true, tipo: true } },
          arte: {
            select: {
              id: true,
              nome: true,
              status: true,
              arquivo: true,
              projeto: {
                select: {
                  id: true,
                  nome: true,
                  cliente: { select: { id: true, nome: true } },
                },
              },
            },
          },
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

    const storagePath = `feedbacks/${arteId}/${Date.now()}_${filename}`
    await uploadFile(storagePath, audioBuffer, 'audio/webm')

    const transcricao = await transcreverAudio(audioBuffer, filename)
    const tipo = posicaoX !== undefined && posicaoY !== undefined ? 'POSICIONAL' : 'AUDIO'

    return prisma.feedback.create({
      data: {
        conteudo: transcricao,
        tipo,
        arquivo: storagePath,
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

  async gerarAudioDoFeedback(id: string): Promise<{ buffer: Buffer; feedback: any }> {
    const feedback = await prisma.feedback.findUnique({ where: { id } })
    if (!feedback) throw new Error('Feedback não encontrado')
    if (!feedback.conteudo || feedback.conteudo.trim().length === 0) {
      throw new Error('Feedback não possui conteúdo textual para sintetizar')
    }

    if (feedback.audioGerado) {
      try {
        const response = await fetch(feedback.audioGerado)
        if (response.ok) {
          return { buffer: Buffer.from(await response.arrayBuffer()), feedback }
        }
      } catch {
        // cache miss — regenera
      }
    }

    const audioBuffer = await sintetizarTexto(feedback.conteudo)
    const storagePath = `feedbacks-tts/${id}/${Date.now()}.mp3`

    try {
      await uploadFile(storagePath, audioBuffer, 'audio/mpeg')
      await prisma.feedback.update({ where: { id }, data: { audioGerado: storagePath } })
    } catch {
      // falha no upload não bloqueia a resposta
    }

    return { buffer: audioBuffer, feedback }
  }

  async getTranscricao(id: string): Promise<string> {
    const feedback = await prisma.feedback.findUnique({ where: { id } })
    if (!feedback) throw new Error('Feedback não encontrado')
    if (feedback.transcricao) return feedback.transcricao
    if (!feedback.arquivo) throw new Error('Feedback não possui áudio para transcrever')

    const response = await fetch(feedback.arquivo)
    if (!response.ok) throw new Error('Erro ao buscar arquivo de áudio')
    const audioBuffer = Buffer.from(await response.arrayBuffer())
    const transcricao = await transcreverAudio(audioBuffer)

    await prisma.feedback.update({ where: { id }, data: { transcricao } })
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
  }
}
