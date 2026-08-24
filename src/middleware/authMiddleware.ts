import { FastifyRequest, FastifyReply } from 'fastify'
import { jwtVerify } from 'jose'
import { getJWTSecret, env } from '../config/env.js'
import prisma from '../database/client.js'
import { lerTokenDaRequisicao } from '../utils/authCookies.js'

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Requisição que só pode ter partido do nosso app.
 *
 * Cookie é enviado pelo navegador automaticamente, inclusive quando quem
 * dispara a requisição é outro site — é assim que CSRF funciona. O header
 * `Authorization` não tem esse problema: alguém precisa colocá-lo ali de
 * propósito.
 *
 * Por isso, escrita autenticada por cookie exige `Origin` conhecido. Com
 * `SameSite=lax` o navegador já não mandaria o cookie nesse cenário, mas um
 * deploy em domínios diferentes obriga `SameSite=none` — e aí esta checagem é
 * o que sobra de proteção.
 */
function origemPermitida(request: FastifyRequest): boolean {
  const origin = request.headers.origin
  if (!origin) return false
  return env.ALLOWED_ORIGINS.split(',')
    .map((o) => o.trim())
    .includes(origin)
}

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const credencial = lerTokenDaRequisicao(request)
  if (!credencial) {
    reply.status(401).send({ message: 'Token não fornecido', success: false })
    return
  }

  if (
    credencial.origem === 'cookie' &&
    !METODOS_SEGUROS.has(request.method) &&
    !origemPermitida(request)
  ) {
    reply.status(403).send({ message: 'Origem não autorizada', success: false })
    return
  }

  const { token } = credencial
  const secret = new TextEncoder().encode(getJWTSecret())

  // Só a verificação do JWT vira 401. Antes um catch único cobria tudo, então
  // uma falha de banco era reportada como "token inválido" — enganoso para
  // quem chama e sem rastro nenhum no log.
  let payload
  try {
    ({ payload } = await jwtVerify(token, secret))
  } catch {
    reply.status(401).send({ message: 'Token inválido ou expirado', success: false })
    return
  }

  try {
    // Verify session is still active (enables token revocation via DELETE /sessoes/:id)
    const sessao = await prisma.sessao.findFirst({
      where: { token, ativo: true, expiresAt: { gt: new Date() } },
      select: { id: true },
    })
    if (!sessao) {
      reply.status(401).send({ message: 'Sessão inválida ou revogada', success: false })
      return
    }

    (request as any).usuario = {
      id: payload.sub as string,
      email: payload['email'] as string,
      nome: payload['nome'] as string,
      tipo: payload['tipo'] as string,
    }
  } catch (error) {
    request.log?.error(error)
    reply.status(500).send({ message: 'Erro na autenticação', success: false })
  }
}
