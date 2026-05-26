import { FastifyRequest, FastifyReply } from 'fastify'
import { jwtVerify } from 'jose'
import { getJWTSecret } from '../config/env.js'

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const authHeader = request.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    reply.status(401).send({ message: 'Token não fornecido', success: false })
    return
  }

  const token = authHeader.slice(7)
  const secret = new TextEncoder().encode(getJWTSecret())

  try {
    const { payload } = await jwtVerify(token, secret)
    ;(request as any).usuario = {
      id: payload.sub as string,
      email: payload['email'] as string,
      nome: payload['nome'] as string,
      tipo: payload['tipo'] as string,
    }
  } catch {
    reply.status(401).send({ message: 'Token inválido ou expirado', success: false })
  }
}
