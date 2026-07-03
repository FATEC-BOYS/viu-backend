import { FastifyRequest, FastifyReply } from 'fastify'
import { DisputaService, DisputaTipo } from '../services/disputaService.js'

const disputaService = new DisputaService()

export async function abrirDisputa(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { tipo, descricao, projetoId, faturaId } = request.body as any

    if (!tipo || !descricao || !projetoId) {
      reply.status(400).send({ message: 'tipo, descricao e projetoId são obrigatórios', success: false })
      return
    }

    const disputa = await disputaService.abrirDisputa({
      tipo: tipo as DisputaTipo,
      descricao,
      abertaPorId: usuario.id,
      projetoId,
      faturaId,
    })

    reply.status(201).send({ data: disputa, success: true })
  } catch (error: any) {
    if (error.message.includes('não encontrado') || error.message.includes('inválido')) {
      reply.status(400).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({ message: 'Erro ao abrir disputa', success: false })
  }
}

export async function listarDisputas(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { projetoId, status } = (request.query || {}) as any

    const filtros = {
      projetoId: projetoId as string | undefined,
      status: status as string | undefined,
      // Non-admins only see their own disputes
      ...(usuario.tipo !== 'ADMIN' ? { abertaPorId: usuario.id } : {}),
    }

    const disputas = await disputaService.listarDisputas(filtros)
    reply.send({ data: disputas, success: true })
  } catch {
    reply.status(500).send({ message: 'Erro ao listar disputas', success: false })
  }
}

export async function getDisputaById(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { id } = request.params as { id: string }

    const disputa = await disputaService.getDisputa(id)
    if (!disputa) {
      reply.status(404).send({ message: 'Disputa não encontrada', success: false })
      return
    }

    // Only admin or the opener can see the dispute
    if (usuario.tipo !== 'ADMIN' && disputa.abertaPorId !== usuario.id) {
      reply.status(403).send({ message: 'Acesso negado', success: false })
      return
    }

    reply.send({ data: disputa, success: true })
  } catch {
    reply.status(500).send({ message: 'Erro ao buscar disputa', success: false })
  }
}

export async function resolverDisputa(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    if (usuario.tipo !== 'ADMIN') {
      reply.status(403).send({ message: 'Apenas administradores podem resolver disputas', success: false })
      return
    }

    const { id } = request.params as { id: string }
    const { resolucao, status } = request.body as any

    if (!resolucao || !status) {
      reply.status(400).send({ message: 'resolucao e status são obrigatórios', success: false })
      return
    }

    const disputa = await disputaService.resolverDisputa(id, { resolucao, status })
    reply.send({ data: disputa, success: true })
  } catch (error: any) {
    if (error.message.includes('não encontrada') || error.message.includes('inválido') || error.message.includes('já foi resolvida')) {
      reply.status(400).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({ message: 'Erro ao resolver disputa', success: false })
  }
}

export async function moverParaAnalise(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    if (usuario.tipo !== 'ADMIN') {
      reply.status(403).send({ message: 'Acesso negado', success: false })
      return
    }
    const { id } = request.params as { id: string }
    const disputa = await disputaService.moverParaAnalise(id)
    reply.send({ data: disputa, success: true })
  } catch {
    reply.status(500).send({ message: 'Erro ao atualizar disputa', success: false })
  }
}
