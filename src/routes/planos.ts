import { env } from '../config/env.js'
import { financeiroApenasAdmin } from '../middleware/financeiroMiddleware.js'
import { FastifyInstance } from 'fastify'
import {
  listPlanosHandler,
  listPlanosAdminHandler,
  getPlanoHandler,
  createPlanoHandler,
  updatePlanoHandler,
} from '../controllers/planoController.js'
import { authenticate } from '../middleware/authMiddleware.js'
import { requireRole } from '../middleware/authorizationMiddleware.js'
import { validateBody } from '../middleware/validationMiddleware.js'
import { PlanoSchema, PlanoUpdateSchema } from '../schemas/validation.js'

export async function planosRoutes(fastify: FastifyInstance) {
  fastify.get('/planos', { preHandler: env.FINANCEIRO_APENAS_ADMIN ? [authenticate, financeiroApenasAdmin] : [] }, listPlanosHandler)
  // Antes de '/planos/:id': rota estática ganha da paramétrica, mas a ordem
  // deixa a intenção clara para quem lê.
  fastify.get('/planos/todos', {
    preHandler: [authenticate, financeiroApenasAdmin, requireRole('ADMIN')],
  }, listPlanosAdminHandler)
  fastify.get('/planos/:id', { preHandler: env.FINANCEIRO_APENAS_ADMIN ? [authenticate, financeiroApenasAdmin] : [] }, getPlanoHandler)
  fastify.post('/planos', {
    preHandler: [authenticate, financeiroApenasAdmin, requireRole('ADMIN'), validateBody(PlanoSchema)],
  }, createPlanoHandler)
  fastify.put('/planos/:id', {
    preHandler: [authenticate, financeiroApenasAdmin, requireRole('ADMIN'), validateBody(PlanoUpdateSchema)],
  }, updatePlanoHandler)
}
