import { FastifyRequest, FastifyReply } from 'fastify'
import prisma from '../database/client.js'

/**
 * Middleware de autorização baseada em papéis (RBAC)
 * Verifica se o usuário tem a role necessária para acessar o recurso
 */
export function requireRole(...roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const usuario = (request as any).usuario

      if (!usuario) {
        return reply.status(401).send({
          message: 'Usuário não autenticado',
          success: false,
        })
      }

      if (!roles.includes(usuario.tipo)) {
        return reply.status(403).send({
          message: 'Acesso negado: permissões insuficientes',
          success: false,
        })
      }
    } catch (error: any) {
      return reply.status(500).send({
        message: 'Erro ao verificar permissões',
        success: false,
      })
    }
  }
}

/**
 * Middleware para verificar se o usuário é o proprietário do recurso
 * ou tem permissão de administrador
 */
export function requireOwnership(resourceType: 'usuario' | 'projeto') {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const usuario = (request as any).usuario
      const { id } = request.params as any

      if (!usuario) {
        return reply.status(401).send({
          message: 'Usuário não autenticado',
          success: false,
        })
      }

      // Admins podem acessar tudo
      if (usuario.tipo === 'ADMIN') {
        return
      }

      // Verifica ownership baseado no tipo de recurso
      if (resourceType === 'usuario') {
        // Usuário só pode modificar seu próprio perfil
        if (usuario.id !== id) {
          return reply.status(403).send({
            message: 'Acesso negado: você só pode modificar seu próprio perfil',
            success: false,
          })
        }
      } else if (resourceType === 'projeto') {
        // Verifica se o usuário é designer ou cliente do projeto
        const projeto = await prisma.projeto.findUnique({
          where: { id },
          select: { designerId: true, clienteId: true },
        })

        if (!projeto) {
          return reply.status(404).send({
            message: 'Projeto não encontrado',
            success: false,
          })
        }

        if (projeto.designerId !== usuario.id && projeto.clienteId !== usuario.id) {
          return reply.status(403).send({
            message: 'Acesso negado: você não tem acesso a este projeto',
            success: false,
          })
        }
      }
    } catch (error: any) {
      return reply.status(500).send({
        message: 'Erro ao verificar propriedade do recurso',
        success: false,
      })
    }
  }
}

/**
 * Middleware para verificar se o usuário tem acesso ao projeto relacionado
 * Usado para artes, feedbacks, tarefas, etc.
 */
export async function requireProjectAccess(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    let projetoId: string | null = null

    if (!usuario) {
      return reply.status(401).send({
        message: 'Usuário não autenticado',
        success: false,
      })
    }

    // Admins podem acessar tudo
    if (usuario.tipo === 'ADMIN') {
      return
    }

    // Extrai projetoId da requisição (pode vir de diferentes lugares)
    const params = request.params as any
    const body = request.body as any

    if (params.projetoId) {
      projetoId = params.projetoId
    } else if (body?.projetoId) {
      projetoId = body.projetoId
    } else if (params.id) {
      // Se for um recurso específico (arte, tarefa, etc), busca o projetoId
      const arteId = params.id
      const arte = await prisma.arte.findUnique({
        where: { id: arteId },
        select: { projetoId: true },
      })
      if (arte) {
        projetoId = arte.projetoId
      } else {
        // Tenta buscar como tarefa
        const tarefa = await prisma.tarefa.findUnique({
          where: { id: arteId },
          select: { projetoId: true },
        })
        if (tarefa) {
          projetoId = tarefa.projetoId
        }
      }
    }

    if (!projetoId) {
      return reply.status(400).send({
        message: 'ID do projeto não fornecido',
        success: false,
      })
    }

    // Verifica se o usuário tem acesso ao projeto
    const projeto = await prisma.projeto.findUnique({
      where: { id: projetoId },
      select: { designerId: true, clienteId: true },
    })

    if (!projeto) {
      return reply.status(404).send({
        message: 'Projeto não encontrado',
        success: false,
      })
    }

    if (projeto.designerId !== usuario.id && projeto.clienteId !== usuario.id) {
      return reply.status(403).send({
        message: 'Acesso negado: você não tem acesso a este projeto',
        success: false,
      })
    }
  } catch (error: any) {
    return reply.status(500).send({
      message: 'Erro ao verificar acesso ao projeto',
      success: false,
    })
  }
}

/**
 * Middleware para verificar se o usuário é o autor do recurso
 * Usado para feedback, aprovações, etc.
 */
export async function requireAuthor(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { id } = request.params as any

    if (!usuario) {
      return reply.status(401).send({
        message: 'Usuário não autenticado',
        success: false,
      })
    }

    // Admins podem acessar tudo
    if (usuario.tipo === 'ADMIN') {
      return
    }

    // Busca o feedback/aprovação e verifica autoria
    const feedback = await prisma.feedback.findUnique({
      where: { id },
      select: { autorId: true },
    })

    if (feedback) {
      if (feedback.autorId !== usuario.id) {
        return reply.status(403).send({
          message: 'Acesso negado: você não é o autor deste recurso',
          success: false,
        })
      }
      return
    }

    const aprovacao = await prisma.aprovacao.findUnique({
      where: { id },
      select: { aprovadorId: true },
    })

    if (aprovacao) {
      if (aprovacao.aprovadorId !== usuario.id) {
        return reply.status(403).send({
          message: 'Acesso negado: você não é o autor desta aprovação',
          success: false,
        })
      }
      return
    }

    return reply.status(404).send({
      message: 'Recurso não encontrado',
      success: false,
    })
  } catch (error: any) {
    return reply.status(500).send({
      message: 'Erro ao verificar autoria',
      success: false,
    })
  }
}
