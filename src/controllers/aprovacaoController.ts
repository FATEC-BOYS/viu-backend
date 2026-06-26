import { FastifyRequest, FastifyReply } from 'fastify'
import { AprovacaoService, ListAprovacoesParams } from '../services/aprovacaoService.js'
import prisma from '../database/client.js'

const aprovacaoService = new AprovacaoService()

export async function listAprovacoes(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { page = 1, limit = 10, arteId, aprovadorId, status } = (request.query || {}) as any
    const params: ListAprovacoesParams = {
      page: Number(page) || 1,
      limit: Number(limit) || 10,
      arteId: arteId as string | undefined,
      aprovadorId: aprovadorId as string | undefined,
      status: status as string | undefined,
    }

    if (usuario.tipo !== 'ADMIN') {
      const projetos = await prisma.projeto.findMany({
        where: { OR: [{ designerId: usuario.id }, { clienteId: usuario.id }] },
        select: { id: true },
      })
      params.projetoIds = projetos.map((p: { id: string }) => p.id)
    }

    const { aprovacoes, total } = await aprovacaoService.listAprovacoes(params)
    reply.send({
      data: aprovacoes,
      pagination: { page: params.page, limit: params.limit, total, pages: Math.ceil(total / params.limit!) },
      success: true,
    })
  } catch {
    reply.status(500).send({ message: 'Erro ao listar aprovações', success: false })
  }
}

export async function getAprovacaoById(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { id } = request.params as { id: string }
    const aprovacao = await aprovacaoService.getAprovacaoById(id)
    if (!aprovacao) {
      reply.status(404).send({ message: 'Aprovação não encontrada', success: false })
      return
    }
    // Non-admin can only see approvals from their projects
    if (usuario.tipo !== 'ADMIN') {
      const projeto = await prisma.projeto.findFirst({
        where: {
          artes: { some: { id: (aprovacao as any).arte?.id } },
          OR: [{ designerId: usuario.id }, { clienteId: usuario.id }],
        },
      })
      if (!projeto) {
        reply.status(403).send({ message: 'Acesso negado', success: false })
        return
      }
    }
    reply.send({ data: aprovacao, success: true })
  } catch {
    reply.status(500).send({ message: 'Erro ao buscar aprovação', success: false })
  }
}

export async function createAprovacao(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const body = request.body as any
    const data = {
      arteId: body.arteId,
      status: body.status ?? 'PENDENTE',
      comentario: body.comentario,
      aprovadorId: usuario.id, // always set from authenticated user, never from body
    }
    const aprovacao = await aprovacaoService.createAprovacao(data)
    reply.status(201).send({ message: 'Aprovação criada com sucesso', data: aprovacao, success: true })
  } catch (error: any) {
    if (
      error.message.includes('não encontrad') ||
      error.message.includes('Apenas o cliente') ||
      error.message.includes('O autor não pode')
    ) {
      reply.status(403).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({ message: 'Erro ao criar aprovação', success: false })
  }
}

export async function updateAprovacao(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { id } = request.params as { id: string }
    const body = request.body as any
    const aprovacao = await aprovacaoService.updateAprovacao(id, body, usuario.id)
    reply.send({ message: 'Aprovação atualizada com sucesso', data: aprovacao, success: true })
  } catch (error: any) {
    if (error.message.includes('Aprovação não encontrada')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    if (error.message.includes('Acesso negado')) {
      reply.status(403).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({ message: 'Erro ao atualizar aprovação', success: false })
  }
}

export async function deleteAprovacao(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { id } = request.params as { id: string }
    await aprovacaoService.deleteAprovacao(id, usuario.id, usuario.tipo === 'ADMIN')
    reply.send({ message: 'Aprovação removida com sucesso', success: true })
  } catch (error: any) {
    if (error.message.includes('Aprovação não encontrada')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    if (error.message.includes('Acesso negado')) {
      reply.status(403).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({ message: 'Erro ao remover aprovação', success: false })
  }
}
