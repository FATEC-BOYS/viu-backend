import { FastifyInstance } from 'fastify'
import {
  listArtes,
  getArteById,
  createArte,
  updateArte,
  deleteArte,
} from '../controllers/arteController.js'
import { authenticate } from '../middleware/authMiddleware.js'
import { requireProjectAccess } from '../middleware/authorizationMiddleware.js'
import { validateBody, validateCuidParam } from '../middleware/validationMiddleware.js'
import { CreateArteRequestSchema } from '../schemas/validation.js'

export async function artesRoutes(fastify: FastifyInstance) {
  fastify.get('/artes', { preHandler: [authenticate] }, listArtes)
  fastify.get('/artes/:id', { preHandler: [authenticate, validateCuidParam, requireProjectAccess] }, getArteById)
  fastify.post('/artes', {
    preHandler: [authenticate, validateBody(CreateArteRequestSchema), requireProjectAccess],
  }, createArte)
  fastify.put('/artes/:id', { preHandler: [authenticate, validateCuidParam, requireProjectAccess] }, updateArte)
  fastify.delete('/artes/:id', { preHandler: [authenticate, validateCuidParam, requireProjectAccess] }, deleteArte)
}
