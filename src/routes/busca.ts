import { FastifyInstance } from 'fastify'
import { buscar } from '../controllers/buscaController.js'
import { authenticate } from '../middleware/authMiddleware.js'

export async function buscaRoutes(fastify: FastifyInstance) {
  fastify.get('/buscar', { preHandler: [authenticate] }, buscar)
}
