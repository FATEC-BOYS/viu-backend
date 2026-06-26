import { FastifyRequest, FastifyReply } from 'fastify'
import { TarefaService, ListTarefasParams } from '../services/tarefaService.js'
import prisma from '../database/client.js'

const tarefaService = new TarefaService()

export async function listTarefas(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { page = 1, limit = 10, projetoId, responsavelId, status, prioridade } = (request.query || {}) as any
    const params: ListTarefasParams = {
      page: Number(page) || 1,
      limit: Number(limit) || 10,
      projetoId: projetoId as string | undefined,
      responsavelId: responsavelId as string | undefined,
      status: status as string | undefined,
      prioridade: prioridade as string | undefined,
    }

    if (usuario.tipo !== 'ADMIN') {
      const projetos = await prisma.projeto.findMany({
        where: { OR: [{ designerId: usuario.id }, { clienteId: usuario.id }] },
        select: { id: true },
      })
      const accessibleIds = projetos.map((p: { id: string }) => p.id)

      if (params.projetoId && !accessibleIds.includes(params.projetoId)) {
        reply.status(403).send({ message: 'Acesso negado', success: false })
        return
      }
      params.projetoIds = accessibleIds
    }

    const { tarefas, total } = await tarefaService.listTarefas(params)
    reply.send({
      data: tarefas,
      pagination: {
        page: params.page,
        limit: params.limit,
        total,
        pages: Math.ceil(total / params.limit!),
      },
      success: true,
    })
  } catch {
    reply.status(500).send({ message: 'Erro ao listar tarefas', success: false })
  }
}

export async function getTarefaById(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const { id } = request.params as { id: string }
    const tarefa = await tarefaService.getTarefaById(id)
    if (!tarefa) {
      reply.status(404).send({ message: 'Tarefa não encontrada', success: false })
      return
    }
    reply.send({ data: tarefa, success: true })
  } catch {
    reply.status(500).send({ message: 'Erro ao buscar tarefa', success: false })
  }
}

export async function createTarefa(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const tarefa = await tarefaService.createTarefa(request.body)
    reply.status(201).send({
      message: 'Tarefa criada com sucesso',
      data: tarefa,
      success: true,
    })
  } catch (error: any) {
    if (
      error.message.includes('Projeto não encontrado') ||
      error.message.includes('Responsável não encontrado')
    ) {
      reply.status(400).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({ message: 'Erro ao criar tarefa', success: false })
  }
}

export async function updateTarefa(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const { id } = request.params as { id: string }
    const tarefa = await tarefaService.updateTarefa(id, request.body)
    reply.send({
      message: 'Tarefa atualizada com sucesso',
      data: tarefa,
      success: true,
    })
  } catch (error: any) {
    if (
      error.message.includes('Tarefa não encontrada') ||
      error.message.includes('Projeto não encontrado') ||
      error.message.includes('Responsável não encontrado')
    ) {
      reply.status(error.message.includes('Tarefa') ? 404 : 400).send({
        message: error.message,
        success: false,
      })
      return
    }
    reply.status(500).send({ message: 'Erro ao atualizar tarefa', success: false })
  }
}

export async function deleteTarefa(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const { id } = request.params as { id: string }
    await tarefaService.deleteTarefa(id)
    reply.send({ message: 'Tarefa removida com sucesso', success: true })
  } catch (error: any) {
    if (error.message.includes('Tarefa não encontrada')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({ message: 'Erro ao remover tarefa', success: false })
  }
}
