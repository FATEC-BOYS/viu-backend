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
  fastify.get('/planos', listPlanosHandler)
  // Antes de '/planos/:id': rota estática ganha da paramétrica, mas a ordem
  // deixa a intenção clara para quem lê.
  fastify.get('/planos/todos', {
    preHandler: [authenticate, requireRole('ADMIN')],
  }, listPlanosAdminHandler)
  fastify.get('/planos/:id', getPlanoHandler)
  fastify.post('/planos', {
    preHandler: [authenticate, requireRole('ADMIN'), validateBody(PlanoSchema)],
  }, createPlanoHandler)
  fastify.put('/planos/:id', {
    preHandler: [authenticate, requireRole('ADMIN'), validateBody(PlanoUpdateSchema)],
  }, updatePlanoHandler)
}
