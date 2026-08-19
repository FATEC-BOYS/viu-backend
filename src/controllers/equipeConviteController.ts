import { FastifyRequest, FastifyReply } from 'fastify'
import {
  criarEquipeConvite,
  aceitarEquipeConvite,
  recusarEquipeConvite,
  listarEquipeConvitesPendentes,
  getEquipeConviteByToken,
  listarConvitesDaEquipe,
} from '../services/equipeConviteService.js'

function isAdmin(usuario: any) {
  return usuario.tipo === 'ADMIN'
}

export async function criarEquipeConviteHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { id } = request.params as { id: string }
    const { convidadoId, papel } = request.body as { convidadoId: string; papel: string }
    const rawToken = await criarEquipeConvite(id, convidadoId, papel, usuario.id, isAdmin(usuario))
    reply.status(201).send({ data: { token: rawToken }, success: true })
  } catch (error: any) {
    if (error.message.includes('não encontrada') || error.message.includes('não encontrado')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    if (error.message.includes('Apenas líderes')) {
      reply.status(403).send({ message: error.message, success: false })
      return
    }
    if (error.message.includes('já é membro') || error.message.includes('Papel inválido')) {
      reply.status(400).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({ message: 'Erro ao criar convite', success: false })
  }
}

export async function aceitarEquipeConviteHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { token } = request.params as { token: string }
    const equipe = await aceitarEquipeConvite(token, usuario.id)
    reply.send({ data: equipe, message: 'Convite aceito. Você agora é membro da equipe.', success: true })
  } catch (error: any) {
    if (error.message.includes('não encontrado') || error.message.includes('inválido')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    if (error.message.includes('não pertence') || error.message.includes('não é para você')) {
      reply.status(403).send({ message: error.message, success: false })
      return
    }
    if (
      error.message.includes('já foi respondido') ||
      error.message.includes('expirou') ||
      error.message.includes('já é membro')
    ) {
      reply.status(409).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({ message: 'Erro ao aceitar convite', success: false })
  }
}

export async function recusarEquipeConviteHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { token } = request.params as { token: string }
    await recusarEquipeConvite(token, usuario.id)
    reply.send({ message: 'Convite recusado.', success: true })
  } catch (error: any) {
    if (error.message.includes('não encontrado') || error.message.includes('inválido')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    if (error.message.includes('não pertence') || error.message.includes('não é para você')) {
      reply.status(403).send({ message: error.message, success: false })
      return
    }
    if (error.message.includes('já foi respondido')) {
      reply.status(409).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({ message: 'Erro ao recusar convite', success: false })
  }
}

export async function listarEquipeConvitesPendentesHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const convites = await listarEquipeConvitesPendentes(usuario.id)
    reply.send({ data: convites, success: true })
  } catch (erro) {
    request.log.error({ erro }, 'Erro ao listar convites')
    reply.status(500).send({ message: 'Erro ao listar convites', success: false })
  }
}

export async function getEquipeConviteByTokenHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const { token } = request.params as { token: string }
    const convite = await getEquipeConviteByToken(token)
    if (!convite) {
      reply.status(404).send({ message: 'Convite não encontrado', success: false })
      return
    }
    reply.send({ data: convite, success: true })
  } catch (erro) {
    request.log.error({ erro }, 'Erro ao buscar convite')
    reply.status(500).send({ message: 'Erro ao buscar convite', success: false })
  }
}

export async function listarConvitesDaEquipeHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { id } = request.params as { id: string }
    const convites = await listarConvitesDaEquipe(id, usuario.id, isAdmin(usuario))
    reply.send({ data: convites, success: true })
  } catch (error: any) {
    if (error.message.includes('Apenas líderes')) {
      reply.status(403).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({ message: 'Erro ao listar convites da equipe', success: false })
  }
}
