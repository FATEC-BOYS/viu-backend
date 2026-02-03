// src/controllers/aprovacaoController.ts
/**
 * Controladores de Aprovações
 *
 * Gerencia requisições relacionadas às aprovações de artes.
 */

import { FastifyRequest, FastifyReply } from 'fastify'
import { AprovacaoService, ListAprovacoesParams } from '../services/aprovacaoService.js'

const aprovacaoService = new AprovacaoService()

export async function listAprovacoes(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const { page = 1, limit = 10, arteId, aprovadorId, status } = (request.query || {}) as any
    const params: ListAprovacoesParams = {
      page: Number(page) || 1,
      limit: Number(limit) || 10,
      arteId: arteId as string | undefined,
      aprovadorId: aprovadorId as string | undefined,
      status: status as string | undefined,
    }
    const { aprovacoes, total } = await aprovacaoService.listAprovacoes(params)
    reply.send({
      data: aprovacoes,
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
      message: 'Erro ao listar aprovações',
      error: error.message,
      success: false,
    })
  }
}

export async function getAprovacaoById(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const { id } = request.params as { id: string }
    const aprovacao = await aprovacaoService.getAprovacaoById(id)
    if (!aprovacao) {
      reply.status(404).send({ message: 'Aprovação não encontrada', success: false })
      return
    }
    reply.send({ data: aprovacao, success: true })
  } catch (error: any) {
    reply.status(500).send({
      message: 'Erro ao buscar aprovação',
      error: error.message,
      success: false,
    })
  }
}

export async function createAprovacao(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const data = {
      ...(request.body as Record<string, any>),
      aprovadorId: usuario?.id,
    }
    const aprovacao = await aprovacaoService.createAprovacao(data)
    reply.status(201).send({
      message: 'Aprovação criada com sucesso',
      data: aprovacao,
      success: true,
    })
  } catch (error: any) {
    if (error.message.includes('Arte não encontrada') || error.message.includes('Aprovador não encontrado')) {
      reply.status(400).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({
      message: 'Erro ao criar aprovação',
      error: error.message,
      success: false,
    })
  }
}

export async function updateAprovacao(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const { id } = request.params as { id: string }
    const updateData = request.body
    const aprovacao = await aprovacaoService.updateAprovacao(id, updateData)
    reply.send({
      message: 'Aprovação atualizada com sucesso',
      data: aprovacao,
      success: true,
    })
  } catch (error: any) {
    if (error.message.includes('Aprovação não encontrada')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({
      message: 'Erro ao atualizar aprovação',
      error: error.message,
      success: false,
    })
  }
}

export async function deleteAprovacao(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const { id } = request.params as { id: string }
    await aprovacaoService.deleteAprovacao(id)
    reply.send({ message: 'Aprovação removida com sucesso', success: true })
  } catch (error: any) {
    if (error.message.includes('Aprovação não encontrada')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({
      message: 'Erro ao remover aprovação',
      error: error.message,
      success: false,
    })
  }
}