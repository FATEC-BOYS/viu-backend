import { FastifyInstance } from 'fastify'
import { getFunil } from '../controllers/funilController.js'
import { authenticate } from '../middleware/authMiddleware.js'

export async function funilRoutes(fastify: FastifyInstance) {
  fastify.get('/funil', { preHandler: [authenticate] }, getFunil)
}
