// src/controllers/arteController.ts
/**
 * Controladores de Artes
 *
 * Intermedia as requisições HTTP relativas às artes, delegando a lógica
 * de negócios ao serviço de artes e montando as respostas adequadas.
 */

import { FastifyRequest, FastifyReply } from 'fastify'
import { ArteService, ListArtesParams } from '../services/arteService.js'

const arteService = new ArteService()

export async function listArtes(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const {
      page = 1,
      limit = 10,
      projetoId,
      autorId,
      status,
      tipo,
      search,
    } = (request.query || {}) as any
    const params: ListArtesParams = {
      page: Number(page),
      limit: Number(limit),
      projetoId: projetoId as string | undefined,
      autorId: autorId as string | undefined,
      status: status as string | undefined,
      tipo: tipo as string | undefined,
      search: search as string | undefined,
    }
    const { artes, total } = await arteService.listArtes(params)
    reply.send({
      data: artes,
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
      message: 'Erro ao listar artes',
      error: error.message,
      success: false,
    })
  }
}

export async function getArteById(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const { id } = request.params as { id: string }
    const arte = await arteService.getArteById(id)
    if (!arte) {
      reply.status(404).send({ message: 'Arte não encontrada', success: false })
      return
    }
    reply.send({ data: arte, success: true })
  } catch (error: any) {
    reply.status(500).send({
      message: 'Erro ao buscar arte',
      error: error.message,
      success: false,
    })
  }
}

export async function createArte(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    // autorId virá do middleware de autenticação
    const usuario = (request as any).usuario
    const data = {
      ...request.body,
      autorId: usuario?.id,
    }
    const arte = await arteService.createArte(data)
    reply.status(201).send({ message: 'Arte criada com sucesso', data: arte, success: true })
  } catch (error: any) {
    if (error.message.includes('Projeto não encontrado') || error.message.includes('Autor não encontrado')) {
      reply.status(400).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({
      message: 'Erro ao criar arte',
      error: error.message,
      success: false,
    })
  }
}

export async function updateArte(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const { id } = request.params as { id: string }
    const updateData = request.body
    const arte = await arteService.updateArte(id, updateData)
    reply.send({ message: 'Arte atualizada com sucesso', data: arte, success: true })
  } catch (error: any) {
    if (error.message.includes('Arte não encontrada')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({
      message: 'Erro ao atualizar arte',
      error: error.message,
      success: false,
    })
  }
}

export async function deleteArte(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const { id } = request.params as { id: string }
    await arteService.deleteArte(id)
    reply.send({ message: 'Arte removida com sucesso', success: true })
  } catch (error: any) {
    if (error.message.includes('Arte não encontrada')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({
      message: 'Erro ao remover arte',
      error: error.message,
      success: false,
    })
  }
}