import { FastifyInstance } from 'fastify'
import {
  createSharedLink,
  getPreviewByToken,
  createGuestFeedback,
} from '../controllers/linkController.js'
import { authenticate } from '../middleware/authMiddleware.js'

export async function linksRoutes(fastify: FastifyInstance) {
  // Criar link compartilhado (requer autenticação)
  fastify.post('/links', { preHandler: [authenticate] }, createSharedLink)

  // Preview público (não requer autenticação)
  fastify.get('/preview/:token', getPreviewByToken)

  // Feedback de visitante externo via link público
  fastify.post('/links/:token/feedbacks', createGuestFeedback)
}
