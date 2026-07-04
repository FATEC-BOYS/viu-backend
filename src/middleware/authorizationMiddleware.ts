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

// Seletor mínimo de acesso ao projeto — reutilizado em todos os branches
const PROJETO_ACCESS_SELECT = { designerId: true, clienteId: true } as const

/**
 * Middleware para verificar se o usuário tem acesso ao projeto relacionado.
 * Usado para artes, feedbacks, tarefas, etc.
 *
 * Fase A: acesso concedido apenas por designerId ou clienteId direto do Projeto.
 * Equipe é agrupamento visual — pertencer a uma equipe NÃO dá acesso aos projetos dela.
 * TODO(fase-b): quando houver demanda real (agência com múltiplos designers),
 * criar requireEquipeAccess e expandir o OR para incluir EquipeMembro com papel LIDER/DESIGNER.
 *
 * Quando o projetoId já está no params/body: 1 query (projeto).
 * Quando só temos o id do recurso (arte/tarefa): 1 query com include,
 * eliminando o N+1 da versão anterior (recurso → projetoId → projeto).
 * O projetoId resolvido é salvo em request.projetoId para reuso nos controllers.
 */
export async function requireProjectAccess(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario

    if (!usuario) {
      return reply.status(401).send({ message: 'Usuário não autenticado', success: false })
    }

    if (usuario.tipo === 'ADMIN') return

    const params = request.params as any
    const body = request.body as any
    const audioData = (request as any).audioData

    let projeto: { designerId: string; clienteId: string } | null = null
    let projetoId: string | null = null

    if (params.projetoId) {
      projetoId = params.projetoId
      projeto = await prisma.projeto.findUnique({
        where: { id: projetoId },
        select: PROJETO_ACCESS_SELECT,
      })
    } else if (body?.projetoId) {
      projetoId = body.projetoId
      projeto = await prisma.projeto.findUnique({
        where: { id: projetoId },
        select: PROJETO_ACCESS_SELECT,
      })
    } else if (params.id) {
      // Busca arte + projeto em 1 query (evita N+1)
      const arte = await prisma.arte.findUnique({
        where: { id: params.id },
        select: { projetoId: true, projeto: { select: PROJETO_ACCESS_SELECT } },
      })
      if (arte) {
        projetoId = arte.projetoId
        projeto = arte.projeto
      } else {
        // Tenta tarefa com mesmo join
        const tarefa = await prisma.tarefa.findUnique({
          where: { id: params.id },
          select: { projetoId: true, projeto: { select: PROJETO_ACCESS_SELECT } },
        })
        if (tarefa) {
          projetoId = tarefa.projetoId
          projeto = tarefa.projeto
        } else {
          // Tenta feedback (arte → projeto em dois níveis)
          const feedback = await prisma.feedback.findUnique({
            where: { id: params.id },
            select: { arte: { select: { projetoId: true, projeto: { select: PROJETO_ACCESS_SELECT } } } },
          })
          if (feedback?.arte) {
            projetoId = feedback.arte.projetoId
            projeto = feedback.arte.projeto
          }
        }
      }
    } else if (audioData?.fields?.arteId?.value) {
      const arte = await prisma.arte.findUnique({
        where: { id: audioData.fields.arteId.value },
        select: { projetoId: true, projeto: { select: PROJETO_ACCESS_SELECT } },
      })
      if (arte) {
        projetoId = arte.projetoId
        projeto = arte.projeto
      }
    }

    if (!projetoId) {
      return reply.status(400).send({ message: 'ID do projeto não fornecido', success: false })
    }

    if (!projeto) {
      return reply.status(404).send({ message: 'Projeto não encontrado', success: false })
    }

    if (projeto.designerId !== usuario.id && projeto.clienteId !== usuario.id) {
      return reply.status(403).send({
        message: 'Acesso negado: você não tem acesso a este projeto',
        success: false,
      })
    }

    // Disponibiliza projetoId para controllers evitarem nova query
    ;(request as any).projetoId = projetoId
  } catch {
    return reply.status(500).send({ message: 'Erro ao verificar acesso ao projeto', success: false })
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
