// src/controllers/notificacaoController.ts
/**
 * Controladores de Notificações
 *
 * Lida com listagem, criação e atualização de notificações do usuário.
 */

import { FastifyRequest, FastifyReply } from 'fastify'
import { NotificacaoService, ListNotificacoesParams } from '../services/notificacaoService.js'

const notificacaoService = new NotificacaoService()

export async function listNotificacoes(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { page = 1, limit = 10, tipo, canal, lida } = (request.query || {}) as any
    const params: ListNotificacoesParams = {
      page: Number(page) || 1,
      limit: Number(limit) || 10,
      usuarioId: usuario?.id,
      tipo: tipo as string | undefined,
      canal: canal as string | undefined,
      lida: lida as any,
    }
    const { notificacoes, total } = await notificacaoService.listNotificacoes(params)
    reply.send({
      data: notificacoes,
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
      message: 'Erro ao listar notificações',
      error: error.message,
      success: false,
    })
  }
}

export async function getNotificacaoById(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { id } = request.params as { id: string }
    const notificacao = await notificacaoService.getNotificacaoById(id)
    if (!notificacao || notificacao.usuarioId !== usuario?.id) {
      reply.status(404).send({ message: 'Notificação não encontrada', success: false })
      return
    }
    reply.send({ data: notificacao, success: true })
  } catch (error: any) {
    reply.status(500).send({
      message: 'Erro ao buscar notificação',
      error: error.message,
      success: false,
    })
  }
}

export async function createNotificacao(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const notificacao = await notificacaoService.createNotificacao(request.body)
    reply.status(201).send({
      message: 'Notificação criada com sucesso',
      data: notificacao,
      success: true,
    })
  } catch (error: any) {
    if (error.message.includes('Usuário não encontrado')) {
      reply.status(400).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({
      message: 'Erro ao criar notificação',
      error: error.message,
      success: false,
    })
  }
}

export async function markNotificacaoAsRead(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { id } = request.params as { id: string }
    const { lida } = request.body as { lida: boolean }
    const notificacao = await notificacaoService.getNotificacaoById(id)
    if (!notificacao || notificacao.usuarioId !== usuario?.id) {
      reply.status(404).send({ message: 'Notificação não encontrada', success: false })
      return
    }
    const updated = await notificacaoService.markAsRead(id, lida)
    reply.send({ message: 'Notificação atualizada com sucesso', data: updated, success: true })
  } catch (error: any) {
    if (error.message.includes('Notificação não encontrada')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({
      message: 'Erro ao atualizar notificação',
      error: error.message,
      success: false,
    })
  }
}

export async function deleteNotificacao(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { id } = request.params as { id: string }
    const notificacao = await notificacaoService.getNotificacaoById(id)
    if (!notificacao || notificacao.usuarioId !== usuario?.id) {
      reply.status(404).send({ message: 'Notificação não encontrada', success: false })
      return
    }
    await notificacaoService.deleteNotificacao(id)
    reply.send({ message: 'Notificação removida com sucesso', success: true })
  } catch (error: any) {
    if (error.message.includes('Notificação não encontrada')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({
      message: 'Erro ao remover notificação',
      error: error.message,
      success: false,
    })
  }
}