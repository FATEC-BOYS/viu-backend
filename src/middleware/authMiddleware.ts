import { FastifyRequest, FastifyReply } from 'fastify'
import bcrypt from 'bcryptjs'
import prisma from '../database/client.js'

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const authHeader = request.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      reply.status(401).send({
        message: 'Token de autenticação não fornecido',
        success: false,
      })
      return
    }

    // Extrai o token composto: "sessionId:rawToken"
    const compositeToken = authHeader.split(' ')[1]
    const [sessionId, rawToken] = compositeToken.split(':')

    if (!sessionId || !rawToken) {
      reply.status(401).send({
        message: 'Token de autenticação inválido',
        success: false,
      })
      return
    }

    // Busca a sessão pelo ID (selector)
    const sessao = await prisma.sessao.findUnique({
      where: { id: sessionId },
      include: { usuario: true },
    })

    if (!sessao || !sessao.ativo || sessao.expiresAt < new Date()) {
      reply.status(401).send({
        message: 'Sessão inválida ou expirada',
        success: false,
      })
      return
    }

    // Verifica se o rawToken corresponde ao hash armazenado (validator)
    const tokenValido = await bcrypt.compare(rawToken, sessao.token)
    if (!tokenValido) {
      reply.status(401).send({
        message: 'Token de autenticação inválido',
        success: false,
      })
      return
    }

    // Anexar usuário à requisição para uso posterior
    ;(request as any).usuario = sessao.usuario
  } catch (error: any) {
    reply.status(401).send({
      message: 'Token de autenticação inválido',
      success: false,
    })
  }
}
