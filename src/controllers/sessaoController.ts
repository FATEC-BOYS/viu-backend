import { FastifyRequest, FastifyReply } from 'fastify'
import { SessaoService, ListSessoesParams } from '../services/sessaoService.js'
import { lerTokenDaRequisicao } from '../utils/authCookies.js'
import { erroInterno } from '../utils/erroInterno.js'

const sessaoService = new SessaoService()

/**
 * Token da requisição atual.
 *
 * Lia `headers.authorization` cru. Depois que a sessão passou a viver em
 * cookie HttpOnly, quem entra pelo navegador não manda esse header — e o
 * resultado era: `isCurrent` sempre falso na listagem, a trava que impede
 * revogar a própria sessão nunca disparando, e `revoke-others` respondendo
 * 401 para todo mundo. Justamente o botão de "me roubaram a sessão".
 *
 * `lerTokenDaRequisicao` é a mesma função que o authenticate usa, então as
 * duas pontas concordam sobre qual é o token da requisição.
 */
function tokenAtual(request: FastifyRequest): string | undefined {
  return lerTokenDaRequisicao(request)?.token
}

export async function listSessoes(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const currentToken = tokenAtual(request)
    const { ativo } = (request.query || {}) as any
    const params: ListSessoesParams = {
      usuarioId: usuario?.id,
      currentToken,
      ativo: ativo as any,
    }
    const sessoes = await sessaoService.listSessoes(params)
    reply.send({ data: sessoes, success: true })
  } catch (erro) {
    request.log.error({ erro }, 'Erro ao listar sessões')
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
    const currentToken = tokenAtual(request)
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
    erroInterno(request, reply, error, 'Erro ao revogar sessão')
  }
}

export async function revokeOtherSessoes(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const currentToken = tokenAtual(request)
    if (!currentToken) {
      reply.status(401).send({ message: 'Token não encontrado', success: false })
      return
    }
    const result = await sessaoService.revokeOtherSessoes(usuario.id, currentToken)
    reply.send({ message: `${result.count} sessão(ões) revogada(s)`, data: { count: result.count }, success: true })
  } catch (erro) {
    request.log.error({ erro }, 'Erro ao revogar sessões')
    reply.status(500).send({ message: 'Erro ao revogar sessões', success: false })
  }
}
