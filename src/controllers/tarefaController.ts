// src/controllers/tarefaController.ts
/**
 * Controladores de Tarefas
 *
 * Responsável por lidar com requisições relacionadas a tarefas.
 */

import { FastifyRequest, FastifyReply } from 'fastify'
import { TarefaService, ListTarefasParams } from '../services/tarefaService.js'

const tarefaService = new TarefaService()

export async function listTarefas(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const { page = 1, limit = 10, projetoId, responsavelId, status, prioridade } = (request.query || {}) as any
    const params: ListTarefasParams = {
      page: Number(page),
      limit: Number(limit),
      projetoId: projetoId as string | undefined,
      responsavelId: responsavelId as string | undefined,
      status: status as string | undefined,
      prioridade: prioridade as string | undefined,
    }
    const { tarefas, total } = await tarefaService.listTarefas(params)
    reply.send({
      data: tarefas,
      pagination: {
        page: params.page,
        limit: params.limit,
        total,
        pages: Math.ceil(total / params.limit),
      },
      success: true,
    })
  } catch (error: any) {
    reply.status(500).send({
      message: 'Erro ao listar tarefas',
      error: error.message,
      success: false,
    })
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
  } catch (error: any) {
    reply.status(500).send({
      message: 'Erro ao buscar tarefa',
      error: error.message,
      success: false,
    })
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
    reply.status(500).send({
      message: 'Erro ao criar tarefa',
      error: error.message,
      success: false,
    })
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
    reply.status(500).send({
      message: 'Erro ao atualizar tarefa',
      error: error.message,
      success: false,
    })
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
    reply.status(500).send({
      message: 'Erro ao remover tarefa',
      error: error.message,
      success: false,
    })
  }
}