import { FastifyRequest, FastifyReply } from 'fastify'
import { ProjetoService, ListProjetosParams } from '../services/projetoService.js'

const projetoService = new ProjetoService()

export async function listProjetos(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const { page = 1, limit = 10, status, designerId, clienteId, search } =
      (request.query || {}) as any
    const params: ListProjetosParams = {
      page: Number(page) || 1,
      limit: Number(limit) || 10,
      status: status as string | undefined,
      designerId: designerId as string | undefined,
      clienteId: clienteId as string | undefined,
      search: search as string | undefined,
    }
    const { projetos, total } = await projetoService.listProjetos(params)
    reply.send({
      data: projetos,
      pagination: {
        page: params.page,
        limit: params.limit,
        total,
        pages: Math.ceil(total / params.limit!),
      },
      success: true,
    })
  } catch {
    reply.status(500).send({ message: 'Erro ao buscar projetos', success: false })
  }
}

export async function getProjetoById(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const { id } = request.params as { id: string }
    const projeto = await projetoService.getProjetoById(id)
    if (!projeto) {
      reply.status(404).send({ message: 'Projeto não encontrado', success: false })
      return
    }
    reply.send({ data: projeto, success: true })
  } catch {
    reply.status(500).send({ message: 'Erro ao buscar projeto', success: false })
  }
}

export async function createProjeto(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const projeto = await projetoService.createProjeto(request.body)
    reply.status(201).send({ message: 'Projeto criado com sucesso', data: projeto, success: true })
  } catch (error: any) {
    if (error.message.includes('não encontrado') || error.message.includes('inativo')) {
      reply.status(400).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({ message: 'Erro ao criar projeto', success: false })
  }
}

export async function updateProjeto(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const { id } = request.params as { id: string }
    const projeto = await projetoService.updateProjeto(id, request.body)
    reply.send({ message: 'Projeto atualizado com sucesso', data: projeto, success: true })
  } catch (error: any) {
    if (error.message.includes('Projeto não encontrado')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({ message: 'Erro ao atualizar projeto', success: false })
  }
}

export async function deleteProjeto(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const { id } = request.params as { id: string }
    await projetoService.deleteProjeto(id)
    reply.send({ message: 'Projeto deletado com sucesso', success: true })
  } catch (error: any) {
    if (error.message.includes('Não é possível deletar')) {
      reply.status(400).send({ message: error.message, success: false })
      return
    }
    if (error.message.includes('Projeto não encontrado')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({ message: 'Erro ao deletar projeto', success: false })
  }
}

export async function dashboardStats(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const data = await projetoService.dashboardStats()
    reply.send({ data, success: true })
  } catch {
    reply.status(500).send({ message: 'Erro ao buscar dashboard', success: false })
  }
}

export async function listProjetosByDesigner(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { designerId } = request.params as { designerId: string }
    const { status } = (request.query || {}) as any

    // Non-admins can only list their own projects
    if (usuario.tipo !== 'ADMIN' && usuario.id !== designerId) {
      reply.status(403).send({ message: 'Acesso negado', success: false })
      return
    }

    const projetos = await projetoService.listProjetosByDesigner(designerId, status as string | undefined)
    reply.send({ data: projetos, success: true })
  } catch {
    reply.status(500).send({ message: 'Erro ao buscar projetos do designer', success: false })
  }
}
