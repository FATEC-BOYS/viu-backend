// src/services/aprovacaoService.ts
/**
 * Serviço de Aprovações
 *
 * Gerencia o ciclo de vida de aprovações de artes, permitindo criar,
 * atualizar status/comentário e listar registros conforme filtros.
 */

import prisma from '../database/client.js'

export interface ListAprovacoesParams {
  page?: number
  limit?: number
  arteId?: string
  aprovadorId?: string
  status?: string
}

export class AprovacaoService {
  async listAprovacoes({
    page = 1,
    limit = 10,
    arteId,
    aprovadorId,
    status,
  }: ListAprovacoesParams) {
    const skip = (page - 1) * limit
    const where: any = {
      ...(arteId && { arteId }),
      ...(aprovadorId && { aprovadorId }),
      ...(status && { status }),
    }
    const [aprovacoes, total] = await Promise.all([
      prisma.aprovacao.findMany({
        where,
        skip,
        take: Number(limit),
        include: {
          arte: { select: { id: true, nome: true } },
          aprovador: { select: { id: true, nome: true, avatar: true } },
        },
        orderBy: { criadoEm: 'desc' },
      }),
      prisma.aprovacao.count({ where }),
    ])
    return { aprovacoes, total }
  }
  async getAprovacaoById(id: string) {
    return prisma.aprovacao.findUnique({
      where: { id },
      include: {
        arte: { select: { id: true, nome: true } },
        aprovador: { select: { id: true, nome: true, avatar: true } },
      },
    })
  }
  async createAprovacao(data: any) {
    const [arte, aprovador] = await Promise.all([
      prisma.arte.findUnique({ where: { id: data.arteId } }),
      prisma.usuario.findUnique({ where: { id: data.aprovadorId } }),
    ])
    if (!arte) throw new Error('Arte não encontrada')
    if (!aprovador) throw new Error('Aprovador não encontrado')
    return prisma.aprovacao.create({ data })
  }
  async updateAprovacao(id: string, updateData: any) {
    const existing = await prisma.aprovacao.findUnique({ where: { id } })
    if (!existing) throw new Error('Aprovação não encontrada')
    return prisma.aprovacao.update({ where: { id }, data: updateData })
  }
  async deleteAprovacao(id: string) {
    const existing = await prisma.aprovacao.findUnique({ where: { id } })
    if (!existing) throw new Error('Aprovação não encontrada')
    await prisma.aprovacao.delete({ where: { id } })
    return
  }
}