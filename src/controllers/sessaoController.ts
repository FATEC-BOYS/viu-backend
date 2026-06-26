import { FastifyRequest, FastifyReply } from 'fastify'
import { SessaoService, ListSessoesParams } from '../services/sessaoService.js'

const sessaoService = new SessaoService()

export async function listSessoes(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const currentToken = request.headers.authorization?.slice(7)
    const { ativo } = (request.query || {}) as any
    const params: ListSessoesParams = {
      usuarioId: usuario?.id,
      currentToken,
      ativo: ativo as any,
    }
    const sessoes = await sessaoService.listSessoes(params)
    reply.send({ data: sessoes, success: true })
  } catch {
    reply.status(500).send({ message: 'Erro ao listar sessões', success: false })
  }
}

export async function revokeSessao(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { id } = request.params as { id: string }
    const sessao = await sessaoService.getSessaoById(id)
    if (!sessao || sessao.usuarioId !== usuario?.id) {
      reply.status(404).send({ message: 'Sessão não encontrada', success: false })
      return
    }
    const currentToken = request.headers.authorization?.slice(7)
    if (sessao.token === currentToken) {
      reply.status(400).send({ message: 'Não é possível revogar a sessão atual por este endpoint. Use POST /auth/logout.', success: false })
      return
    }
    await sessaoService.revokeSessao(id)
    reply.send({ message: 'Sessão revogada com sucesso', success: true })
  } catch (error: any) {
    if (error.message.includes('não encontrada')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({ message: 'Erro ao revogar sessão', success: false })
  }
}

export async function revokeOtherSessoes(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const currentToken = request.headers.authorization?.slice(7)
    if (!currentToken) {
      reply.status(401).send({ message: 'Token não encontrado', success: false })
      return
    }
    const result = await sessaoService.revokeOtherSessoes(usuario.id, currentToken)
    reply.send({ message: `${result.count} sessão(ões) revogada(s)`, data: { count: result.count }, success: true })
  } catch {
    reply.status(500).send({ message: 'Erro ao revogar sessões', success: false })
  }
}
