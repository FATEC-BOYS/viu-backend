import { FastifyInstance } from 'fastify'
import {
  createSharedLink,
  getPreviewByToken,
  listLinks,
  updateLink,
  deleteLink,
  revokeLink,
  createFeedbackViaLink,
  createAudioFeedbackViaLink,
} from '../controllers/linkController.js'
import { authenticate } from '../middleware/authMiddleware.js'
import { validateAudioUpload } from '../middleware/fileUploadMiddleware.js'

export async function linksRoutes(fastify: FastifyInstance) {
  fastify.post('/links', {
    // 20 links por hora — geração massiva de links é um vetor de crawling
    config: { rateLimit: { max: 20, timeWindow: '1 hour' } },
    preHandler: [authenticate],
  }, createSharedLink)

  fastify.get('/links', { preHandler: [authenticate] }, listLinks)
  fastify.put('/links/:id', { preHandler: [authenticate] }, updateLink)
  fastify.delete('/links/:id', { preHandler: [authenticate] }, deleteLink)

  // Revogação explícita — mantém o registro no banco (diferente de delete)
  fastify.put('/links/:id/revogar', { preHandler: [authenticate] }, revokeLink)

  fastify.get('/preview/:token', getPreviewByToken)

  fastify.post('/links/:token/feedbacks', { preHandler: [authenticate] }, createFeedbackViaLink)
  fastify.post('/links/:token/feedbacks/audio', {
    // 10 transcrições por hora — chamada cara (OpenAI Whisper)
    config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
    preHandler: [authenticate, validateAudioUpload],
  }, createAudioFeedbackViaLink)
}
