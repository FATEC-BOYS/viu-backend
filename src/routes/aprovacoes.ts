import { FastifyInstance } from 'fastify'
import {
  listAprovacoes,
  getAprovacaoById,
  createAprovacao,
  updateAprovacao,
  deleteAprovacao,
} from '../controllers/aprovacaoController.js'
import { authenticate } from '../middleware/authMiddleware.js'
import { validateBody, validateCuidParam } from '../middleware/validationMiddleware.js'
import { CreateAprovacaoRequestSchema } from '../schemas/validation.js'

export async function aprovacoesRoutes(fastify: FastifyInstance) {
  fastify.get('/aprovacoes', { preHandler: [authenticate] }, listAprovacoes)
  fastify.get('/aprovacoes/:id', { preHandler: [authenticate, validateCuidParam] }, getAprovacaoById)
  fastify.post('/aprovacoes', {
    preHandler: [authenticate, validateBody(CreateAprovacaoRequestSchema)],
  }, createAprovacao)
  fastify.put('/aprovacoes/:id', {
    preHandler: [authenticate, validateCuidParam],
  }, updateAprovacao)
  fastify.delete('/aprovacoes/:id', { preHandler: [authenticate, validateCuidParam] }, deleteAprovacao)
}
