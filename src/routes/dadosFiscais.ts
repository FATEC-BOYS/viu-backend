import { FastifyInstance } from 'fastify'
import { authenticate } from '../middleware/authMiddleware.js'
import { validateBody } from '../middleware/validationMiddleware.js'
import { DadosFiscaisSchema } from '../schemas/validation.js'
import {
  getDadosFiscaisHandler,
  salvarDadosFiscaisHandler,
  removerDadosFiscaisHandler,
} from '../controllers/dadosFiscaisController.js'

/**
 * Os dados fiscais são sempre os de QUEM PEDE.
 *
 * Nenhuma rota recebe `usuarioId`: ela sai da sessão. Documento, endereço e
 * inscrição municipal juntos identificam uma pessoa de forma bem mais completa
 * do que o resto do cadastro, e uma rota que aceitasse o id de outra conta
 * seria um caminho para ler isso de terceiros.
 */
export async function dadosFiscaisRoutes(fastify: FastifyInstance) {
  fastify.get('/dados-fiscais', { preHandler: [authenticate] }, getDadosFiscaisHandler)
  fastify.put(
    '/dados-fiscais',
    { preHandler: [authenticate, validateBody(DadosFiscaisSchema)] },
    salvarDadosFiscaisHandler,
  )
  fastify.delete('/dados-fiscais', { preHandler: [authenticate] }, removerDadosFiscaisHandler)
}
