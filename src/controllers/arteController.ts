import { FastifyRequest, FastifyReply } from 'fastify'
import { ArteService, ListArtesParams } from '../services/arteService.js'
import { signPath } from '../utils/supabaseStorage.js'

const arteService = new ArteService()

export async function listArtes(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const { page = 1, limit = 10, projetoId, autorId, status, tipo, search } =
      (request.query || {}) as any
    const params: ListArtesParams = {
      page: Number(page) || 1,
      limit: Number(limit) || 10,
      projetoId: projetoId as string | undefined,
      autorId: autorId as string | undefined,
      status: status as string | undefined,
      tipo: tipo as string | undefined,
      search: search as string | undefined,
    }
    const { artes, total } = await arteService.listArtes(params)
    reply.send({
      data: artes,
      pagination: { page: params.page, limit: params.limit, total, pages: Math.ceil(total / params.limit!) },
      success: true,
    })
  } catch {
    reply.status(500).send({ message: 'Erro ao listar artes', success: false })
  }
}

export async function getArteById(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const { id } = request.params as { id: string }
    const arte = await arteService.getArteById(id)
    if (!arte) {
      reply.status(404).send({ message: 'Arte não encontrada', success: false })
      return
    }
    const arquivo_url = await signPath(arte.arquivo)
    const feedbacksComUrl = await Promise.all(
      (arte.feedbacks || []).map(async (fb: any) => ({
        ...fb,
        arquivo_url: fb.tipo === 'AUDIO' && fb.arquivo ? await signPath(fb.arquivo) : null,
      })),
    )
    reply.send({ data: { ...arte, arquivo_url, feedbacks: feedbacksComUrl }, success: true })
  } catch {
    reply.status(500).send({ message: 'Erro ao buscar arte', success: false })
  }
}

export async function createArte(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const data = { ...(request.body as Record<string, any>), autorId: usuario?.id }
    const arte = await arteService.createArte(data)
    reply.status(201).send({ message: 'Arte criada com sucesso', data: arte, success: true })
  } catch (error: any) {
    if (error.message.includes('não encontrado')) {
      reply.status(400).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({ message: 'Erro ao criar arte', success: false })
  }
}

export async function updateArte(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const { id } = request.params as { id: string }
    const arte = await arteService.updateArte(id, request.body)
    reply.send({ message: 'Arte atualizada com sucesso', data: arte, success: true })
  } catch (error: any) {
    if (error.message.includes('Arte não encontrada')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({ message: 'Erro ao atualizar arte', success: false })
  }
}

export async function deleteArte(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const { id } = request.params as { id: string }
    await arteService.deleteArte(id)
    reply.send({ message: 'Arte removida com sucesso', success: true })
  } catch (error: any) {
    if (error.message.includes('Arte não encontrada')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({ message: 'Erro ao remover arte', success: false })
  }
}
