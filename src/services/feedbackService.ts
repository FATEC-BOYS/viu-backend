// src/services/feedbackService.ts
/**
 * Serviço de Feedbacks
 *
 * Fornece operações CRUD para feedbacks associados às artes. Inclui
 * verificação de relacionamento com arte e autor.
 */

import prisma from '../database/client.js'

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