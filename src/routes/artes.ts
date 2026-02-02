// src/routes/artes.ts
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

export async function artesRoutes(fastify: FastifyInstance) {
  fastify.get('/artes', { preHandler: [authenticate] }, listArtes)
  fastify.get('/artes/:id', { preHandler: [authenticate, requireProjectAccess] }, getArteById)
  fastify.post('/artes', { preHandler: [authenticate, requireProjectAccess] }, createArte)
  fastify.put('/artes/:id', { preHandler: [authenticate, requireProjectAccess] }, updateArte)
  fastify.delete('/artes/:id', { preHandler: [authenticate, requireProjectAccess] }, deleteArte)
}