// src/controllers/projetoController.ts
/**
 * Controladores de Projetos
 *
 * A camada de controller orquestra a comunicação entre as rotas e o
 * serviço de projetos. Ela extrai os parâmetros de requisição, delega
 * a lógica de negócio ao serviço e estrutura a resposta HTTP.
 */

import { FastifyRequest, FastifyReply } from 'fastify'
import { ProjetoService, ListProjetosParams } from '../services/projetoService.js'

const projetoService = new ProjetoService()

/**
 * Lista projetos com filtros e paginação.
 */
export async function listProjetos(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      designerId,
      clienteId,
      search,
    } = (request.query || {}) as any

    const params: ListProjetosParams = {
      page: Number(page),
      limit: Number(limit),
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
        pages: Math.ceil(total / params.limit),
      },
      success: true,
    })
  } catch (error: any) {
    reply.status(500).send({
      message: 'Erro ao buscar projetos',
      error: error.message,
      success: false,
    })
  }
}

/**
 * Busca projeto por ID com detalhes completos.
 */
export async function getProjetoById(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const { id } = request.params as { id: string }
    const projeto = await projetoService.getProjetoById(id)
    if (!projeto) {
      reply.status(404).send({
        message: 'Projeto não encontrado',
        success: false,
      })
      return
    }
    reply.send({
      data: projeto,
      success: true,
    })
  } catch (error: any) {
    reply.status(500).send({
      message: 'Erro ao buscar projeto',
      error: error.message,
      success: false,
    })
  }
}

/**
 * Cria um novo projeto.
 */
export async function createProjeto(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    // Dados já foram validados no middleware de validação
    const projetoData = request.body
    const projeto = await projetoService.createProjeto(projetoData)
    reply.status(201).send({
      message: 'Projeto criado com sucesso',
      data: projeto,
      success: true,
    })
  } catch (error: any) {
    // Erros de validação ou de verificação de dependências são retornados como 400
    if (error.message.includes('não encontrado') || error.message.includes('inativo')) {
      reply.status(400).send({
        message: error.message,
        success: false,
      })
      return
    }
    reply.status(500).send({
      message: 'Erro ao criar projeto',
      error: error.message,
      success: false,
    })
  }
}

/**
 * Atualiza um projeto existente.
 */
export async function updateProjeto(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const { id } = request.params as { id: string }
    const updateData = request.body
    const projeto = await projetoService.updateProjeto(id, updateData)
    reply.send({
      message: 'Projeto atualizado com sucesso',
      data: projeto,
      success: true,
    })
  } catch (error: any) {
    if (error.message.includes('Projeto não encontrado')) {
      reply.status(404).send({
        message: error.message,
        success: false,
      })
      return
    }
    if (error.name === 'ZodError') {
      reply.status(400).send({
        message: 'Dados inválidos',
        errors: error.errors,
        success: false,
      })
      return
    }
    reply.status(500).send({
      message: 'Erro ao atualizar projeto',
      error: error.message,
      success: false,
    })
  }
}

/**
 * Remove um projeto.
 */
export async function deleteProjeto(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const { id } = request.params as { id: string }
    await projetoService.deleteProjeto(id)
    reply.send({
      message: 'Projeto deletado com sucesso',
      success: true,
    })
  } catch (error: any) {
    if (error.message.includes('Não é possível deletar')) {
      reply.status(400).send({
        message: error.message,
        success: false,
      })
      return
    }
    if (error.message.includes('Projeto não encontrado')) {
      reply.status(404).send({
        message: error.message,
        success: false,
      })
      return
    }
    reply.status(500).send({
      message: 'Erro ao deletar projeto',
      error: error.message,
      success: false,
    })
  }
}

/**
 * Retorna estatísticas para o dashboard de projetos.
 */
export async function dashboardStats(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const data = await projetoService.dashboardStats()
    reply.send({
      data,
      success: true,
    })
  } catch (error: any) {
    reply.status(500).send({
      message: 'Erro ao buscar dashboard',
      error: error.message,
      success: false,
    })
  }
}

/**
 * Lista projetos por designer.
 */
export async function listProjetosByDesigner(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const { designerId } = request.params as { designerId: string }
    const { status } = (request.query || {}) as any
    const projetos = await projetoService.listProjetosByDesigner(
      designerId,
      status as string | undefined,
    )
    reply.send({
      data: projetos,
      success: true,
    })
  } catch (error: any) {
    reply.status(500).send({
      message: 'Erro ao buscar projetos do designer',
      error: error.message,
      success: false,
    })
  }
}