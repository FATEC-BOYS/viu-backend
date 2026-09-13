import { FastifyRequest, FastifyReply } from 'fastify'
import { entrarComo, sairDaImpersonacao } from '../services/impersonacaoService.js'
import { definirCookiesDeSessao, lerTokenDaRequisicao } from '../utils/authCookies.js'
import { auditLogService } from '../services/auditLogService.js'
import { erroInterno } from '../utils/erroInterno.js'

function origem(request: FastifyRequest) {
  return {
    ip: request.ip ?? request.headers['x-forwarded-for']?.toString().split(',')[0]?.trim(),
    userAgent: request.headers['user-agent'],
  }
}

export async function entrarComoUsuario(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const admin = (request as any).usuario
  const { usuarioId } = request.params as { usuarioId: string }
  try {
    if (admin?.tipo !== 'ADMIN') {
      reply.status(403).send({ message: 'Acesso negado', success: false })
      return
    }
    /*
     * Um admin já dentro de outra conta não abre uma terceira: a saída devolve
     * para `impersonadoPorId`, e encadear deixaria alguém preso no meio.
     */
    if (admin.impersonadoPor) {
      reply.status(409).send({
        message: 'Saia da conta atual antes de entrar em outra.',
        success: false,
      })
      return
    }

    const sessao = await entrarComo(admin.id, usuarioId)
    const { ip, userAgent } = origem(request)

    /*
     * Auditoria ANTES de responder, e não em fire-and-forget: este é o registro
     * de que alguém entrou na conta de outra pessoa. Perdê-lo em silêncio por
     * causa de uma falha de banco é justamente o caso em que ele faria falta.
     */
    await auditLogService.log({
      action: 'IMPERSONATE_START',
      resource: 'Sessao',
      resourceId: sessao.usuario.id,
      usuarioId: admin.id,
      ipAddress: ip,
      userAgent,
      details: { alvo: { id: sessao.usuario.id, email: sessao.usuario.email } },
      status: 'SUCCESS',
    })

    definirCookiesDeSessao(
      reply,
      { token: sessao.token, refreshToken: sessao.refreshToken },
      { expiresAt: sessao.expiresAt, refreshExpiresAt: sessao.refreshExpiresAt },
    )
    reply.send({ data: { usuario: sessao.usuario, expiraEm: sessao.expiresAt }, success: true })
  } catch (error: any) {
    const { ip, userAgent } = origem(request)
    await auditLogService.log({
      action: 'IMPERSONATE_START',
      resource: 'Sessao',
      resourceId: usuarioId,
      usuarioId: admin?.id,
      ipAddress: ip,
      userAgent,
      status: 'FAILURE',
      errorMessage: error.message,
    })
    if (error.message.includes('Acesso negado')) {
      reply.status(403).send({ message: error.message, success: false })
      return
    }
    if (error.message.includes('não encontrado')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    if (error.message.includes('outro administrador') || error.message.includes('inativa')) {
      reply.status(422).send({ message: error.message, success: false })
      return
    }
    erroInterno(request, reply, error, 'Erro ao entrar na conta')
  }
}

export async function sairDaConta(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const credencial = lerTokenDaRequisicao(request)
    if (!credencial) {
      reply.status(401).send({ message: 'Token não fornecido', success: false })
      return
    }

    const sessao = await sairDaImpersonacao(credencial.token)
    const { ip, userAgent } = origem(request)

    await auditLogService.log({
      action: 'IMPERSONATE_END',
      resource: 'Sessao',
      resourceId: (request as any).usuario?.id,
      usuarioId: sessao.usuario.id,
      ipAddress: ip,
      userAgent,
      status: 'SUCCESS',
    })

    definirCookiesDeSessao(
      reply,
      { token: sessao.token, refreshToken: sessao.refreshToken },
      { expiresAt: sessao.expiresAt, refreshExpiresAt: sessao.refreshExpiresAt },
    )
    reply.send({ data: { usuario: sessao.usuario }, success: true })
  } catch (error: any) {
    if (error.message.includes('não é uma impersonação')) {
      reply.status(409).send({ message: error.message, success: false })
      return
    }
    erroInterno(request, reply, error, 'Erro ao sair da conta')
  }
}
