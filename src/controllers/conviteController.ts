import { FastifyRequest, FastifyReply } from 'fastify'
import {
  criarConvite,
  aceitarConvite,
  recusarConvite,
  listarConvitesPendentes,
  getConviteByToken,
  listarConvitesDoProjeto,
} from '../services/conviteService.js'

export async function createConvite(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { projetoId } = request.params as { projetoId: string }
    const { convidadoId } = request.body as any

    if (!convidadoId) {
      reply.status(400).send({ message: 'convidadoId é obrigatório', success: false })
      return
    }

    const rawToken = await criarConvite(projetoId, convidadoId, usuario.id)
    reply.status(201).send({ data: { token: rawToken }, success: true })
  } catch (error: any) {
    if (error.message.includes('não encontrado') || error.message.includes('inativo') || error.message.includes('só pode ser criado')) {
      reply.status(400).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({ message: 'Erro ao criar convite', success: false })
  }
}

export async function getConvite(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const { token } = request.params as { token: string }
    const convite = await getConviteByToken(token)
    if (!convite) {
      reply.status(404).send({ message: 'Convite não encontrado ou inválido', success: false })
      return
    }
    reply.send({ data: convite, success: true })
  } catch {
    reply.status(500).send({ message: 'Erro ao buscar convite', success: false })
  }
}

export async function listarConvites(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const convites = await listarConvitesPendentes(usuario.id)
    reply.send({ data: convites, success: true })
  } catch {
    reply.status(500).send({ message: 'Erro ao listar convites', success: false })
  }
}

export async function aceitarConviteHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { token } = request.params as { token: string }
    const projeto = await aceitarConvite(token, usuario.id)
    reply.send({ data: projeto, success: true, message: 'Convite aceito com sucesso' })
  } catch (error: any) {
    if (error.message.includes('não pertence a você') || error.message.includes('Acesso negado')) {
      reply.status(403).send({ message: error.message, success: false })
      return
    }
    if (
      error.message.includes('não encontrado') ||
      error.message.includes('inválido') ||
      error.message.includes('já foi respondido') ||
      error.message.includes('expirou') ||
      error.message.includes('não está mais aguardando')
    ) {
      reply.status(400).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({ message: 'Erro ao aceitar convite', success: false })
  }
}

export async function recusarConviteHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { token } = request.params as { token: string }
    await recusarConvite(token, usuario.id)
    reply.send({ success: true, message: 'Convite recusado' })
  } catch (error: any) {
    if (error.message.includes('não pertence a você') || error.message.includes('Acesso negado')) {
      reply.status(403).send({ message: error.message, success: false })
      return
    }
    if (
      error.message.includes('não encontrado') ||
      error.message.includes('inválido') ||
      error.message.includes('já foi respondido')
    ) {
      reply.status(400).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({ message: 'Erro ao recusar convite', success: false })
  }
}

export async function listarConvitesDoProjetoHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const { projetoId } = request.params as { projetoId: string }
    const convites = await listarConvitesDoProjeto(projetoId)
    reply.send({ data: convites, success: true })
  } catch (error) {
    request.log.error(error)
    reply.status(500).send({ message: 'Erro ao listar convites do projeto', success: false })
  }
}
