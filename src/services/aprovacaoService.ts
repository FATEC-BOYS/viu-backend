import prisma from '../database/client.js'

export interface ListAprovacoesParams {
  page?: number
  limit?: number
  arteId?: string
  aprovadorId?: string
  status?: string
  // access-control scope (set by controller for non-admins)
  projetoIds?: string[]
}

export class AprovacaoService {
  async listAprovacoes({
    page = 1,
    limit = 10,
    arteId,
    aprovadorId,
    status,
    projetoIds,
  }: ListAprovacoesParams) {
    const skip = (page - 1) * limit
    const where: any = {
      ...(arteId && { arteId }),
      ...(aprovadorId && { aprovadorId }),
      ...(status && { status }),
      ...(projetoIds && { arte: { projetoId: { in: projetoIds } } }),
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

  async createAprovacao(data: {
    arteId: string
    status: string
    comentario?: string
    aprovadorId: string
  }) {
    const arte = await prisma.arte.findUnique({
      where: { id: data.arteId },
      include: {
        projeto: { select: { clienteId: true, designerId: true } },
      },
    })
    if (!arte) throw new Error('Arte não encontrada')

    // Only the client of the project can approve/reject
    if (arte.projeto.clienteId !== data.aprovadorId) {
      throw new Error('Apenas o cliente do projeto pode aprovar ou rejeitar artes')
    }
    // Designer cannot approve their own work
    if (arte.autorId === data.aprovadorId) {
      throw new Error('O autor não pode aprovar a própria arte')
    }

    return prisma.aprovacao.create({
      data: {
        arteId: data.arteId,
        status: data.status,
        comentario: data.comentario,
        aprovadorId: data.aprovadorId,
      },
    })
  }

  async updateAprovacao(id: string, updateData: { status?: string; comentario?: string }, userId: string) {
    const existing = await prisma.aprovacao.findUnique({
      where: { id },
      include: { arte: { include: { projeto: { select: { clienteId: true } } } } },
    })
    if (!existing) throw new Error('Aprovação não encontrada')

    // Only the original approver (client) can update
    if (existing.aprovadorId !== userId) {
      throw new Error('Acesso negado: apenas o aprovador original pode atualizar esta aprovação')
    }

    const allowedUpdate: Record<string, any> = {}
    if (updateData.status !== undefined) allowedUpdate.status = updateData.status
    if (updateData.comentario !== undefined) allowedUpdate.comentario = updateData.comentario

    return prisma.aprovacao.update({ where: { id }, data: allowedUpdate })
  }

  async deleteAprovacao(id: string, userId: string, isAdmin: boolean) {
    const existing = await prisma.aprovacao.findUnique({ where: { id } })
    if (!existing) throw new Error('Aprovação não encontrada')

    if (!isAdmin && existing.aprovadorId !== userId) {
      throw new Error('Acesso negado: você não pode excluir esta aprovação')
    }

    await prisma.aprovacao.delete({ where: { id } })
  }
}
