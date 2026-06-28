import { FastifyRequest, FastifyReply } from 'fastify'
import { listPlanos, getPlanoById, createPlano, updatePlano } from '../services/planoService.js'

export async function listPlanosHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const { tipo } = (request.query || {}) as any
    const planos = await listPlanos(tipo)
    reply.send({ data: planos, success: true })
  } catch {
    reply.status(500).send({ message: 'Erro ao buscar planos', success: false })
  }
}

export async function getPlanoHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const { id } = request.params as { id: string }
    const plano = await getPlanoById(id)
    reply.send({ data: plano, success: true })
  } catch (error: any) {
    if (error.message.includes('não encontrado')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({ message: 'Erro ao buscar plano', success: false })
  }
}

export async function createPlanoHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const plano = await createPlano(request.body as any)
    reply.status(201).send({ message: 'Plano criado com sucesso', data: plano, success: true })
  } catch {
    reply.status(500).send({ message: 'Erro ao criar plano', success: false })
  }
}

export async function updatePlanoHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const { id } = request.params as { id: string }
    const plano = await updatePlano(id, request.body as any)
    reply.send({ message: 'Plano atualizado com sucesso', data: plano, success: true })
  } catch (error: any) {
    if (error.message.includes('não encontrado')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({ message: 'Erro ao atualizar plano', success: false })
  }
}
