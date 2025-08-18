// src/services/tarefaService.ts
/**
 * Serviço de Tarefas
 *
 * Responsável por operações de CRUD em tarefas, incluindo verificação
 * de relacionamentos com projeto e responsável.
 */

import prisma from '../database/client.js'

export interface ListTarefasParams {
  page?: number
  limit?: number
  projetoId?: string
  responsavelId?: string
  status?: string
  prioridade?: string
}

export class TarefaService {
  async listTarefas({
    page = 1,
    limit = 10,
    projetoId,
    responsavelId,
    status,
    prioridade,
  }: ListTarefasParams) {
    const skip = (page - 1) * limit
    const where: any = {
      ...(projetoId && { projetoId }),
      ...(responsavelId && { responsavelId }),
      ...(status && { status }),
      ...(prioridade && { prioridade }),
    }
    const [tarefas, total] = await Promise.all([
      prisma.tarefa.findMany({
        where,
        skip,
        take: Number(limit),
        include: {
          projeto: { select: { id: true, nome: true } },
          responsavel: { select: { id: true, nome: true, avatar: true } },
        },
        orderBy: { criadoEm: 'desc' },
      }),
      prisma.tarefa.count({ where }),
    ])
    return { tarefas, total }
  }
  async getTarefaById(id: string) {
    return prisma.tarefa.findUnique({
      where: { id },
      include: {
        projeto: { select: { id: true, nome: true } },
        responsavel: { select: { id: true, nome: true, avatar: true } },
      },
    })
  }
  async createTarefa(data: any) {
    // Verificar projeto se fornecido
    if (data.projetoId) {
      const projeto = await prisma.projeto.findUnique({ where: { id: data.projetoId } })
      if (!projeto) throw new Error('Projeto não encontrado')
    }
    const responsavel = await prisma.usuario.findUnique({ where: { id: data.responsavelId } })
    if (!responsavel) throw new Error('Responsável não encontrado')
    return prisma.tarefa.create({ data })
  }
  async updateTarefa(id: string, updateData: any) {
    const existing = await prisma.tarefa.findUnique({ where: { id } })
    if (!existing) throw new Error('Tarefa não encontrada')
    if (updateData.projetoId) {
      const projeto = await prisma.projeto.findUnique({ where: { id: updateData.projetoId } })
      if (!projeto) throw new Error('Projeto não encontrado')
    }
    if (updateData.responsavelId) {
      const responsavel = await prisma.usuario.findUnique({ where: { id: updateData.responsavelId } })
      if (!responsavel) throw new Error('Responsável não encontrado')
    }
    return prisma.tarefa.update({ where: { id }, data: updateData })
  }
  async deleteTarefa(id: string) {
    const existing = await prisma.tarefa.findUnique({ where: { id } })
    if (!existing) throw new Error('Tarefa não encontrada')
    await prisma.tarefa.delete({ where: { id } })
    return
  }
}