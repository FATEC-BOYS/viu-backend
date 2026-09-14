import { createHash } from 'node:crypto'
import type { FastifyRequest } from 'fastify'

/**
 * A chave do limite de comentários: a credencial, e não o IP.
 *
 * Comentar exige conta em todas as portas (link e sessão), então o IP é a
 * chave errada dos dois lados. Ele pune junto quem divide escritório, wi-fi de
 * cafeteria ou operadora móvel — e não segura nada de quem roda script atrás
 * de IPs rotativos.
 *
 * A credencial é a chave certa porque conseguir um balde novo passa a custar
 * uma conta nova, e cadastro já tem limite próprio (REGISTRO_MAX_HORA /
 * REGISTRO_MAX_DIA). Não é preciso que a credencial seja VÁLIDA para servir de
 * chave: o limite roda em `onRequest`, antes do `authenticate`, e quem mandar
 * lixo ganha um balde próprio e em seguida um 401 — sem tocar na peça.
 *
 * Guardamos o hash, não a credencial: o store do rate-limit fica em memória e
 * não tem por que conter token de ninguém.
 */
export function chaveDoComentario(request: FastifyRequest): string {
  const bruto =
    request.headers.authorization ??
    (typeof request.headers.cookie === 'string' ? request.headers.cookie : null)

  if (!bruto) return `ip:${request.ip}`

  return `cred:${createHash('sha256').update(bruto).digest('hex').slice(0, 32)}`
}
