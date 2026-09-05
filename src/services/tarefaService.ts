// src/services/tarefaService.ts
/**
 * Serviço de Tarefas
 *
 * Responsável por operações de CRUD em tarefas, incluindo verificação
 * de relacionamentos com projeto e responsável.
 */

import prisma from '../database/client.js'
import { assertValidTransition, TAREFA_TRANSITIONS } from '../utils/stateMachine.js'
import { PROJETO_ACCESS_SELECT, assertAcessoAoProjeto } from '../utils/projectAccess.js'

export interface ListTarefasParams {
  page?: number
  limit?: number
  projetoId?: string
  projetoIds?: string[] // access-control scope (set by controller for non-admins)
  responsavelId?: string
  status?: string
  prioridade?: string
}

export class TarefaService {
  async listTarefas({
    page = 1,
    limit = 10,
    projetoId,
    projetoIds,
    responsavelId,
    status,
    prioridade,
  }: ListTarefasParams) {
    const skip = (page - 1) * limit
    const where: any = {
      ...(projetoId
        ? { projetoId }
        : projetoIds && { projetoId: { in: projetoIds } }),
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
    const projeto = await prisma.projeto.findUnique({ where: { id: data.projetoId } })
    if (!projeto) throw new Error('Projeto não encontrado')

    if (data.responsavelId) {
      const isParticipant =
        projeto.designerId === data.responsavelId || projeto.clienteId === data.responsavelId
      if (!isParticipant) throw new Error('Responsável não é participante do projeto')
    }

    return prisma.tarefa.create({ data })
  }
  /**
   * Atualiza uma tarefa.
   *
   * Duas checagens de acesso, não uma: a tarefa de origem e, quando o corpo
   * pede para movê-la, o projeto de destino. Sem a segunda, quem alcança a
   * tarefa poderia empurrá-la para dentro do projeto de outra pessoa.
   */
  async updateTarefa(id: string, updateData: any, requesterId: string, isAdmin = false) {
    const existing = await prisma.tarefa.findUnique({ where: { id }, include: { projeto: true } })
    if (!existing) throw new Error('Tarefa não encontrada')

    assertAcessoAoProjeto(existing.projeto, requesterId, isAdmin)

    const projetoId = updateData.projetoId ?? existing.projetoId
    const projeto = projetoId !== existing.projetoId
      ? await prisma.projeto.findUnique({ where: { id: projetoId } })
      : existing.projeto
    if (updateData.projetoId && !projeto) throw new Error('Projeto não encontrado')

    // Mudança de projeto: o destino também precisa ser alcançável.
    if (updateData.projetoId && projetoId !== existing.projetoId) {
      assertAcessoAoProjeto(projeto, requesterId, isAdmin)
    }

    if (updateData.responsavelId && projeto) {
      const isParticipant =
        projeto.designerId === updateData.responsavelId || projeto.clienteId === updateData.responsavelId
      if (!isParticipant) throw new Error('Responsável não é participante do projeto')
    }

    if (updateData.status && updateData.status !== existing.status) {
      assertValidTransition('Tarefa', TAREFA_TRANSITIONS, existing.status, updateData.status)
    }

    return prisma.tarefa.update({ where: { id }, data: updateData })
  }
  async deleteTarefa(id: string, requesterId: string, isAdmin = false) {
    const existing = await prisma.tarefa.findUnique({
      where: { id },
      include: { projeto: { select: PROJETO_ACCESS_SELECT } },
    })
    if (!existing) throw new Error('Tarefa não encontrada')
    assertAcessoAoProjeto(existing.projeto, requesterId, isAdmin)

    await prisma.tarefa.delete({ where: { id } })
    return
  }
}