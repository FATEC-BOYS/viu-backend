import type { FastifyReply, FastifyRequest } from 'fastify'
import { env } from '../config/env.js'

/**
 * Cookies de sessão.
 *
 * O token vivia em `localStorage` no frontend, o que significa que qualquer
 * XSS na aplicação conseguia lê-lo e agir como o usuário por tempo
 * indeterminado. Com `HttpOnly` o JavaScript da página não alcança o valor: o
 * navegador anexa o cookie sozinho e o script nunca vê o token.
 *
 * O header `Authorization: Bearer` continua aceito no `authenticate` — clientes
 * que não são navegador (scripts, integrações, os testes) seguem funcionando.
 */

export const COOKIE_TOKEN = 'viu_token'
export const COOKIE_REFRESH = 'viu_refresh_token'

/**
 * `SameSite` depende de onde a API está publicada em relação ao app:
 *
 * - mesmo site registrável (viu.app e api.viu.app, ou localhost:3000 e
 *   localhost:3001 — porta não conta para "site"): `lax` serve, e é o que dá
 *   proteção contra CSRF de graça.
 * - domínios diferentes (app.vercel.app e api.railway.app): o navegador trata
 *   como cross-site e só envia o cookie com `none`, que exige `Secure` e
 *   **abre mão da proteção contra CSRF** — nesse caso a guarda de origem em
 *   authMiddleware passa a ser a única defesa.
 */
function opcoesBase() {
  const sameSite = env.COOKIE_SAMESITE
  return {
    httpOnly: true,
    sameSite,
    // `none` sem `Secure` é recusado por qualquer navegador atual.
    secure: sameSite === 'none' || env.NODE_ENV === 'production',
    path: '/',
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  } as const
}

export interface Sessao {
  token: string
  refreshToken: string
}

/**
 * Grava os dois cookies da sessão.
 *
 * O prazo de cada cookie acompanha o do respectivo token no banco; sem
 * `expires` eles morreriam ao fechar o navegador, o que derrubaria o
 * "continuar conectado" que o refresh token existe para dar.
 */
export function definirCookiesDeSessao(
  reply: FastifyReply,
  sessao: Sessao,
  prazos: { expiresAt: Date; refreshExpiresAt: Date },
): void {
  const base = opcoesBase()
  reply.setCookie(COOKIE_TOKEN, sessao.token, { ...base, expires: prazos.expiresAt })
  reply.setCookie(COOKIE_REFRESH, sessao.refreshToken, {
    ...base,
    expires: prazos.refreshExpiresAt,
  })
}

/** Remove os cookies — usado no logout e quando o refresh falha. */
export function limparCookiesDeSessao(reply: FastifyReply): void {
  const base = opcoesBase()
  reply.clearCookie(COOKIE_TOKEN, base)
  reply.clearCookie(COOKIE_REFRESH, base)
}

/** Token de acesso da requisição: header tem precedência sobre o cookie. */
export function lerTokenDaRequisicao(
  request: FastifyRequest,
): { token: string; origem: 'header' | 'cookie' } | null {
  const authHeader = request.headers.authorization
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim()
    if (token) return { token, origem: 'header' }
  }

  const doCookie = (request as any).cookies?.[COOKIE_TOKEN]
  if (doCookie) return { token: doCookie, origem: 'cookie' }

  return null
}

/** Refresh token da requisição: corpo (clientes não-navegador) ou cookie. */
export function lerRefreshTokenDaRequisicao(request: FastifyRequest): string | null {
  const doCorpo = (request.body as { refreshToken?: string } | undefined)?.refreshToken
  if (doCorpo) return doCorpo

  const doCookie = (request as any).cookies?.[COOKIE_REFRESH]
  return doCookie ?? null
}
