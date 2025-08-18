// src/controllers/feedbackController.ts
/**
 * Controladores de Feedbacks
 *
 * Processa requisições HTTP relacionadas a feedbacks, delegando a
 * lógica de negócio ao serviço de feedbacks.
 */

import { FastifyRequest, FastifyReply } from 'fastify'
import { FeedbackService, ListFeedbacksParams } from '../services/feedbackService.js'

const feedbackService = new FeedbackService()

export async function listFeedbacks(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const { page = 1, limit = 10, arteId, autorId, tipo } = (request.query || {}) as any
    const params: ListFeedbacksParams = {
      page: Number(page),
      limit: Number(limit),
      arteId: arteId as string | undefined,
      autorId: autorId as string | undefined,
      tipo: tipo as string | undefined,
    }
    const { feedbacks, total } = await feedbackService.listFeedbacks(params)
    reply.send({
      data: feedbacks,
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
      message: 'Erro ao listar feedbacks',
      error: error.message,
      success: false,
    })
  }
}

export async function getFeedbackById(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const { id } = request.params as { id: string }
    const feedback = await feedbackService.getFeedbackById(id)
    if (!feedback) {
      reply.status(404).send({ message: 'Feedback não encontrado', success: false })
      return
    }
    reply.send({ data: feedback, success: true })
  } catch (error: any) {
    reply.status(500).send({
      message: 'Erro ao buscar feedback',
      error: error.message,
      success: false,
    })
  }
}

export async function createFeedback(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const data = {
      ...request.body,
      autorId: usuario?.id,
    }
    const feedback = await feedbackService.createFeedback(data)
    reply.status(201).send({
      message: 'Feedback criado com sucesso',
      data: feedback,
      success: true,
    })
  } catch (error: any) {
    if (error.message.includes('Arte não encontrada') || error.message.includes('Autor não encontrado')) {
      reply.status(400).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({
      message: 'Erro ao criar feedback',
      error: error.message,
      success: false,
    })
  }
}

export async function updateFeedback(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const { id } = request.params as { id: string }
    const updateData = request.body
    const feedback = await feedbackService.updateFeedback(id, updateData)
    reply.send({
      message: 'Feedback atualizado com sucesso',
      data: feedback,
      success: true,
    })
  } catch (error: any) {
    if (error.message.includes('Feedback não encontrado')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({
      message: 'Erro ao atualizar feedback',
      error: error.message,
      success: false,
    })
  }
}

export async function deleteFeedback(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const { id } = request.params as { id: string }
    await feedbackService.deleteFeedback(id)
    reply.send({ message: 'Feedback removido com sucesso', success: true })
  } catch (error: any) {
    if (error.message.includes('Feedback não encontrado')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({
      message: 'Erro ao remover feedback',
      error: error.message,
      success: false,
    })
  }
}