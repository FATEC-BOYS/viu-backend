import { FastifyInstance } from 'fastify'
import {
  listPlanosHandler,
  getPlanoHandler,
  createPlanoHandler,
  updatePlanoHandler,
} from '../controllers/planoController.js'
import { authenticate } from '../middleware/authMiddleware.js'
import { requireRole } from '../middleware/authorizationMiddleware.js'

export async function planosRoutes(fastify: FastifyInstance) {
  fastify.get('/planos', listPlanosHandler)
  fastify.get('/planos/:id', getPlanoHandler)
  fastify.post('/planos', { preHandler: [authenticate, requireRole('ADMIN')] }, createPlanoHandler)
  fastify.put('/planos/:id', { preHandler: [authenticate, requireRole('ADMIN')] }, updatePlanoHandler)
}
