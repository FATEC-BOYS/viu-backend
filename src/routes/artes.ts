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

export async function artesRoutes(fastify: FastifyInstance) {
  fastify.get('/artes', { preHandler: [authenticate] }, listArtes)
  fastify.get('/artes/:id', { preHandler: [authenticate] }, getArteById)
  fastify.post('/artes', { preHandler: [authenticate] }, createArte)
  fastify.put('/artes/:id', { preHandler: [authenticate] }, updateArte)
  fastify.delete('/artes/:id', { preHandler: [authenticate] }, deleteArte)
}