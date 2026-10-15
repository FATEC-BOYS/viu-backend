import type { FastifyReply, FastifyRequest } from 'fastify'
import { env } from '../config/env.js'

/** Piloto: mantém módulos comerciais para revisão do ADM sem apagar os dados. */
export async function financeiroApenasAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!env.FINANCEIRO_APENAS_ADMIN) return
  const usuario = (request as FastifyRequest & { usuario?: { tipo?: string } }).usuario
  if (usuario?.tipo !== 'ADMIN') {
    reply.status(403).send({ success: false, message: 'Este recurso não está disponível no piloto.' })
  }
}
