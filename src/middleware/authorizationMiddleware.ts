import { FastifyRequest, FastifyReply } from 'fastify'
import prisma from '../database/client.js'
import { Permissao, TIPO_PERMISSIONS, EQUIPE_PAPEL_PERMISSIONS } from '../utils/permissions.js'
import {
  PROJETO_ACCESS_SELECT,
  ProjetoAcesso,
  participaDoProjeto,
} from '../utils/projectAccess.js'

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
 * RBAC por ação: verifica se o usuário tem a permissão nomeada.
 *
 * Ordem de verificação:
 *   1. Tipo global (ADMIN, DESIGNER, CLIENTE) via TIPO_PERMISSIONS
 *   2. Papel na equipe via EQUIPE_PAPEL_PERMISSIONS:
 *      - Se params.id existe, tenta como equipeId (rotas /equipes/:id/*)
 *      - Senão, resolve via projeto → equipe (quando projetoId disponível)
 *
 * O service-level check permanece como autoridade final — este middleware
 * é uma camada de defesa em profundidade e early-exit.
 */
export function requirePermission(action: Permissao) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const usuario = (request as any).usuario
      if (!usuario) {
        return reply.status(401).send({ message: 'Usuário não autenticado', success: false })
      }

      // 1. Global tipo check
      const tipoPerms = TIPO_PERMISSIONS[usuario.tipo] ?? []
      if (tipoPerms.includes(action)) return

      // 2. Equipe role check
      const params = request.params as any

      if (params.id) {
        // params.id may be an equipeId (e.g. /equipes/:id/convites)
        const membroEquipe = await prisma.equipeMembro.findFirst({
          where: { equipeId: params.id, usuarioId: usuario.id },
          select: { papel: true },
        })
        if (membroEquipe) {
          const papelPerms = EQUIPE_PAPEL_PERMISSIONS[membroEquipe.papel] ?? []
          if (papelPerms.includes(action)) return
        }
      }

      // Also check via project → equipe when projetoId is resolved by a prior middleware
      const projetoId = (request as any).projetoId ?? params.projetoId
      if (projetoId) {
        const projeto = await prisma.projeto.findUnique({
          where: { id: projetoId },
          select: { equipeId: true },
        })
        if (projeto?.equipeId) {
          const membroProjeto = await prisma.equipeMembro.findFirst({
            where: { equipeId: projeto.equipeId, usuarioId: usuario.id },
            select: { papel: true },
          })
          if (membroProjeto) {
            const papelPerms = EQUIPE_PAPEL_PERMISSIONS[membroProjeto.papel] ?? []
            if (papelPerms.includes(action)) return
          }
        }
      }

      return reply.status(403).send({
        message: `Acesso negado: permissão "${action}" necessária`,
        success: false,
        requiredPermission: action,
      })
    } catch {
      return reply.status(500).send({ message: 'Erro ao verificar permissão', success: false })
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

// Recurso → projeto, com o projeto no mesmo select (evita o N+1 de
// recurso → projetoId → projeto). A ordem é a de tentativa: arte, tarefa,
// feedback — os três tipos que chegam como `:id` nas rotas que usam este
// middleware.
const RESOLVEDORES_POR_ID = [
  async (id: string) => {
    const arte = await prisma.arte.findUnique({
      where: { id },
      select: { projetoId: true, projeto: { select: PROJETO_ACCESS_SELECT } },
    })
    return arte ? { projetoId: arte.projetoId ?? undefined, projeto: arte.projeto } : null
  },
  async (id: string) => {
    const tarefa = await prisma.tarefa.findUnique({
      where: { id },
      select: { projetoId: true, projeto: { select: PROJETO_ACCESS_SELECT } },
    })
    // Tarefa.projetoId é opcional no schema — tarefa solta não tem projeto
    return tarefa ? { projetoId: tarefa.projetoId ?? undefined, projeto: tarefa.projeto } : null
  },
  async (id: string) => {
    const feedback = await prisma.feedback.findUnique({
      where: { id },
      select: { arte: { select: { projetoId: true, projeto: { select: PROJETO_ACCESS_SELECT } } } },
    })
    return feedback?.arte
      ? { projetoId: feedback.arte.projetoId ?? undefined, projeto: feedback.arte.projeto }
      : null
  },
]

interface ProjetoResolvido {
  projetoId: string | undefined
  projeto: ProjetoAcesso | null
}

/** Percorre os resolvedores até um casar. `null` = nenhum recurso com esse id. */
async function resolverPorIdDeRecurso(id: string): Promise<ProjetoResolvido | null> {
  for (const resolver of RESOLVEDORES_POR_ID) {
    const encontrado = await resolver(id)
    if (encontrado) return encontrado
  }
  return null
}

async function resolverPorArteId(arteId: string): Promise<ProjetoResolvido | null> {
  const arte = await prisma.arte.findUnique({
    where: { id: arteId },
    select: { projetoId: true, projeto: { select: PROJETO_ACCESS_SELECT } },
  })
  return arte ? { projetoId: arte.projetoId ?? undefined, projeto: arte.projeto } : null
}

/**
 * Middleware para verificar se o usuário tem acesso ao projeto relacionado.
 * Usado para artes, feedbacks, tarefas, etc.
 *
 * Fase A: acesso concedido apenas por designerId ou clienteId direto do Projeto.
 * Equipe é agrupamento visual — pertencer a uma equipe NÃO dá acesso aos projetos dela.
 * A regra em si mora em utils/projectAccess.ts; aqui só se decide *qual*
 * projeto perguntar.
 *
 * ## Precedência — o ponto sensível
 *
 * A ordem abaixo não é arbitrária: **o recurso que a rota endereça manda, e o
 * corpo é o último recurso**. A versão anterior consultava `body.projetoId`
 * antes de `params.id`, e isso era um IDOR: em `PUT /artes/:id` bastava mandar
 * no corpo o id de um projeto próprio para o middleware autorizar contra *esse*
 * projeto e liberar a escrita numa arte de outra pessoa — o middleware nunca
 * chegava a olhar a arte. Valia para artes, tarefas, threads de feedback e para
 * criar feedback em arte alheia.
 *
 *   1. params.projetoId  — a rota já diz o projeto (/projetos/:projetoId/...)
 *   2. params.id         — o recurso endereçado (arte → tarefa → feedback)
 *   3. body.arteId       — criação: o alvo é a arte, não um projeto solto
 *   4. audioData.arteId  — idem, via multipart
 *   5. body.projetoId    — só sobra para rotas de criação sem recurso alvo
 *
 * Quando `params.id` existe mas nenhum recurso casa, a resposta é 404: cair no
 * corpo aqui seria reabrir exatamente o furo acima.
 *
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

    let resolvido: ProjetoResolvido | null = null

    if (params.projetoId) {
      resolvido = {
        projetoId: params.projetoId,
        projeto: await prisma.projeto.findUnique({
          where: { id: params.projetoId },
          select: PROJETO_ACCESS_SELECT,
        }),
      }
    } else if (params.id) {
      resolvido = await resolverPorIdDeRecurso(params.id)
      if (!resolvido) {
        // Nenhuma arte/tarefa/feedback com esse id. Não há para onde recuar:
        // usar o corpo aqui é o IDOR descrito acima.
        return reply.status(404).send({ message: 'Recurso não encontrado', success: false })
      }
    } else if (body?.arteId) {
      // POST /feedbacks manda arteId no corpo — é o que CreateFeedbackRequestSchema
      // declara. É o recurso alvo, então vem antes de body.projetoId.
      resolvido = await resolverPorArteId(body.arteId)
      if (!resolvido) {
        return reply.status(404).send({ message: 'Arte não encontrada', success: false })
      }
    } else if (audioData?.fields?.arteId?.value) {
      resolvido = await resolverPorArteId(audioData.fields.arteId.value)
      if (!resolvido) {
        return reply.status(404).send({ message: 'Arte não encontrada', success: false })
      }
    } else if (body?.projetoId) {
      resolvido = {
        projetoId: body.projetoId,
        projeto: await prisma.projeto.findUnique({
          where: { id: body.projetoId },
          select: PROJETO_ACCESS_SELECT,
        }),
      }
    }

    if (!resolvido?.projetoId) {
      return reply.status(400).send({ message: 'ID do projeto não fornecido', success: false })
    }

    if (!resolvido.projeto) {
      return reply.status(404).send({ message: 'Projeto não encontrado', success: false })
    }

    if (!participaDoProjeto(resolvido.projeto, usuario.id)) {
      return reply.status(403).send({
        message: 'Acesso negado: você não tem acesso a este projeto',
        success: false,
      })
    }

    // Disponibiliza projetoId para controllers evitarem nova query
    (request as any).projetoId = resolvido.projetoId
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
