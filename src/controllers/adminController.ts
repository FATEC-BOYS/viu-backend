import { FastifyRequest, FastifyReply } from 'fastify'
import { obterResumoAdmin } from '../services/adminResumoService.js'

export async function getResumoAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const resumo = await obterResumoAdmin()
    reply.send({ data: resumo, success: true })
  } catch (erro) {
    request.log.error({ err: erro }, 'Erro ao montar o resumo do admin')
    reply.status(500).send({ message: 'Erro ao carregar o resumo', success: false })
  }
}
