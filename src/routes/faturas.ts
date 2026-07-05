import { FastifyInstance } from 'fastify'
import {
  criarFaturaHandler,
  pagarFaturaPixHandler,
  listarFaturasHandler,
  getFaturaHandler,
  cancelarFaturaHandler,
} from '../controllers/faturaController.js'
import { authenticate } from '../middleware/authMiddleware.js'
import { requirePermission } from '../middleware/authorizationMiddleware.js'
import { validateBody } from '../middleware/validationMiddleware.js'
import { CriarFaturaSchema, PagarFaturaPixSchema } from '../schemas/validation.js'
import { PERMISSOES } from '../utils/permissions.js'

export async function faturasRoutes(fastify: FastifyInstance) {
  fastify.get('/faturas', { preHandler: [authenticate] }, listarFaturasHandler)
  fastify.get('/faturas/:id', { preHandler: [authenticate] }, getFaturaHandler)
  fastify.post('/projetos/:id/fatura', {
    preHandler: [authenticate, requirePermission(PERMISSOES.EDITAR_FINANCEIRO), validateBody(CriarFaturaSchema)],
  }, criarFaturaHandler)
  fastify.post('/faturas/:id/pagar/pix', { preHandler: [authenticate, validateBody(PagarFaturaPixSchema)] }, pagarFaturaPixHandler)
  fastify.delete('/faturas/:id', {
    preHandler: [authenticate, requirePermission(PERMISSOES.EDITAR_FINANCEIRO)],
  }, cancelarFaturaHandler)
}
