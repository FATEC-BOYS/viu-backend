import { FastifyRequest, FastifyReply } from 'fastify'
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
    const token = authHeader.split(' ')[1]
    const sessao = await prisma.sessao.findUnique({
      where: { token },
      include: { usuario: true },
    })
    if (!sessao || !sessao.ativo || sessao.expiresAt < new Date()) {
      reply.status(401).send({
        message: 'Sessão inválida ou expirada',
        success: false,
      })
      return
    }
    // Anexar usuário à requisição para uso posterior
    ;(request as any).usuario = sessao.usuario
  } catch (error: any) {
    reply.status(500).send({
      message: 'Erro na autenticação',
      error: error.message,
      success: false,
    })
  }
}
