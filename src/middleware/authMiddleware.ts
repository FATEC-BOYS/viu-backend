import { FastifyRequest, FastifyReply } from 'fastify'
import { jwtVerify } from 'jose'
import { getJWTSecret, env } from '../config/env.js'
import prisma from '../database/client.js'
import { lerTokenDaRequisicao } from '../utils/authCookies.js'
import { erroInterno } from '../utils/erroInterno.js'

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * As únicas rotas que uma sessão de impersonação pode chamar com método não
 * seguro: as duas que servem para SAIR dela.
 *
 * Sem esta exceção o admin entraria e não conseguiria voltar, porque a saída é
 * um POST — e a alternativa, fazê-la GET, seria mudar estado por navegação.
 */
const SAIDAS_DA_IMPERSONACAO = new Set(['/admin/impersonar/sair', '/auth/logout'])

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
      select: { id: true, impersonadoPorId: true },
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
      // Quem está realmente dentro, quando isto é uma impersonação. Sai da
      // linha da sessão e não de uma claim do JWT: assim revogar no banco tem
      // efeito imediato, e não existem duas fontes para o mesmo fato.
      impersonadoPor: sessao.impersonadoPorId ?? null,
    }

    /*
     * IMPERSONAÇÃO É SOMENTE LEITURA, e a regra mora aqui — no lugar por onde
     * toda rota autenticada passa — em vez de numa lista de rotas protegidas.
     *
     * A diferença importa: com lista de proteção, a rota criada mês que vem
     * nasce escrevível e ninguém percebe. Negando por padrão, ela nasce
     * bloqueada e quem precisar liberar tem que dizer isso em voz alta.
     *
     * O que está em jogo é o valor probatório do produto inteiro: aceite,
     * aprovação e feedback carimbado só provam alguma coisa enquanto tiverem
     * sido escritos pela pessoa a quem estão atribuídos.
     */
    if (
      sessao.impersonadoPorId &&
      !METODOS_SEGUROS.has(request.method) &&
      !SAIDAS_DA_IMPERSONACAO.has(request.url.split('?')[0] ?? '')
    ) {
      reply.status(403).send({
        message:
          'Você está vendo esta conta como administrador. O acesso é somente leitura — saia da conta para agir em nome próprio.',
        success: false,
        impersonacao: true,
      })
      return
    }
  } catch (error) {
    request.log?.error(error)
    erroInterno(request, reply, error, 'Erro na autenticação')
  }
}
