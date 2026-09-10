import { FastifyRequest, FastifyReply } from 'fastify'
import { ProjetoService, ListProjetosParams } from '../services/projetoService.js'
import { evaluateBriefing } from '../services/evalForgeService.js'
import { AceiteService } from '../services/aceiteService.js'
import { isMembroEquipe } from '../services/equipeService.js'
import { criarConvite } from '../services/conviteService.js'
import { erroInterno } from '../utils/erroInterno.js'

const projetoService = new ProjetoService()
const aceiteService = new AceiteService()

/**
 * Valida que o usuário pertence à equipe antes de vinculá-la ao projeto.
 * equipeId is organizational only and does not grant project access.
 * Retorna false se o usuário não pertencer (caller envia 403).
 */
async function assertEquipeMembership(
  equipeId: string | null | undefined,
  usuarioId: string,
  isAdmin: boolean,
): Promise<boolean> {
  if (!equipeId || isAdmin) return true
  return isMembroEquipe(equipeId, usuarioId)
}

export async function listProjetos(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { page = 1, limit = 10, status, designerId, clienteId, search } =
      (request.query || {}) as any
    const params: ListProjetosParams = {
      page: Number(page) || 1,
      limit: Number(limit) || 10,
      status: status as string | undefined,
      search: search as string | undefined,
    }
    if (usuario?.tipo === 'ADMIN') {
      // Admins can filter by arbitrary designer/client
      params.designerId = designerId as string | undefined
      params.clienteId = clienteId as string | undefined
    } else {
      // Non-admins see only their own projects; ignore caller-supplied filters
      params.userId = usuario?.id
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
  } catch (erro) {
    request.log.error({ err: erro }, 'Erro ao buscar projetos')
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
  } catch (erro) {
    request.log.error({ err: erro }, 'Erro ao buscar projeto')
    reply.status(500).send({ message: 'Erro ao buscar projeto', success: false })
  }
}

export async function createProjeto(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const body = request.body as any
    const usuario = (request as any).usuario
    const skipBriefingEval = body.skipBriefingEval === true
    const descricao: string | undefined = body.descricao

    if (!skipBriefingEval && descricao && descricao.trim().length >= 30) {
      const evalResult = await evaluateBriefing(descricao)
      if (!evalResult.passed) {
        reply.status(422).send({
          message: 'O briefing precisa de melhorias antes de criar o projeto.',
          evalResult,
          success: false,
        })
        return
      }
    }

    // TODO(ux): implement invite/accept flow so a designer can't pick any active client
    // and vice-versa. For now any active user of the correct type is allowed (MVP).
    // designerId é opcional no schema: um designer criando projeto é o designer.
    // Exigir que ele repita o próprio id era redundante e rejeitava o corpo que
    // o próprio CreateProjetoRequestSchema documenta.
    if (usuario?.tipo === 'DESIGNER' && body.designerId === undefined) {
      body.designerId = usuario.id
    }

    // Non-admin users can only create projects where they are the participant
    if (usuario?.tipo === 'DESIGNER' && body.designerId !== usuario.id) {
      reply.status(403).send({ message: 'Designers só podem criar projetos onde são o designer', success: false })
      return
    }
    if (usuario?.tipo === 'CLIENTE' && body.clienteId !== usuario.id) {
      reply.status(403).send({ message: 'Clientes só podem criar projetos onde são o cliente', success: false })
      return
    }

    // Fase A: equipeId é agrupamento visual — não concede acesso ao projeto.
    // TODO(fase-b): quando equipe conceder acesso, substituir por requireEquipeAccess
    // e expandir ownership para incluir membros com papel LIDER/DESIGNER.
    if (!(await assertEquipeMembership(body.equipeId, usuario.id, usuario?.tipo === 'ADMIN'))) {
      reply.status(403).send({ message: 'Você não pertence a essa equipe', success: false })
      return
    }

    // Non-admins start a project in RASCUNHO; the other party must accept the invite.
    // Admins can pass any status (or default to whatever the service sets).
    const isAdmin = usuario?.tipo === 'ADMIN'
    const projetoData = isAdmin ? body : { ...body, status: 'RASCUNHO' }

    const projeto = await projetoService.createProjeto(projetoData)

    // Send invite to the other party so they confirm participation.
    if (!isAdmin) {
      const convidadoId = usuario.tipo === 'DESIGNER' ? projeto.clienteId : projeto.designerId
      criarConvite(projeto.id, convidadoId, usuario.id).catch(
        (err) => console.error('[PROJETO] Falha ao criar convite automático:', err),
      )
    }

    // Record electronic contract acceptance (Lei 14.063/20)
    if (body.aceiteTermos === true && usuario?.id) {
      const ip = request.ip ?? request.headers['x-forwarded-for']?.toString().split(',')[0]?.trim()
      const userAgent = request.headers['user-agent']
      aceiteService.registrarAceite({
        usuarioId: usuario.id,
        projetoId: projeto.id,
        ip,
        userAgent,
      }).catch(() => {})
    }

    reply.status(201).send({ message: 'Projeto criado com sucesso', data: projeto, success: true })
  } catch (error: any) {
    if (error.message.includes('não encontrado') || error.message.includes('inativo')) {
      reply.status(400).send({ message: error.message, success: false })
      return
    }
    erroInterno(request, reply, error, 'Erro ao criar projeto')
  }
}

export async function updateProjeto(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const { id } = request.params as { id: string }
    const usuario = (request as any).usuario
    const body = request.body as any

    // Fase A: equipeId é agrupamento visual — não concede acesso ao projeto.
    // null é permitido (desvincula equipe); string deve pertencer ao usuário.
    if (!(await assertEquipeMembership(body.equipeId, usuario?.id, usuario?.tipo === 'ADMIN'))) {
      reply.status(403).send({ message: 'Você não pertence a essa equipe', success: false })
      return
    }

    const projeto = await projetoService.updateProjeto(id, body)
    reply.send({ message: 'Projeto atualizado com sucesso', data: projeto, success: true })
  } catch (error: any) {
    if (error.message.includes('Projeto não encontrado')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    erroInterno(request, reply, error, 'Erro ao atualizar projeto')
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
    erroInterno(request, reply, error, 'Erro ao deletar projeto')
  }
}

export async function dashboardStats(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const data = await projetoService.dashboardStats()
    reply.send({ data, success: true })
  } catch (erro) {
    request.log.error({ err: erro }, 'Erro ao buscar dashboard')
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
  } catch (erro) {
    request.log.error({ err: erro }, 'Erro ao buscar projetos do designer')
    reply.status(500).send({ message: 'Erro ao buscar projetos do designer', success: false })
  }
}
