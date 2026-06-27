// src/routes/links.ts
import { FastifyInstance } from 'fastify'
import {
  createSharedLink,
  getPreviewByToken,
  listLinks,
  updateLink,
  deleteLink,
  createFeedbackViaLink,
  createAudioFeedbackViaLink,
} from '../controllers/linkController.js'
import { authenticate } from '../middleware/authMiddleware.js'
import { validateAudioUpload } from '../middleware/fileUploadMiddleware.js'

export async function linksRoutes(fastify: FastifyInstance) {
  fastify.post('/links', { preHandler: [authenticate] }, createSharedLink)
  fastify.get('/links', { preHandler: [authenticate] }, listLinks)
  fastify.put('/links/:id', { preHandler: [authenticate] }, updateLink)
  fastify.delete('/links/:id', { preHandler: [authenticate] }, deleteLink)
  fastify.get('/preview/:token', getPreviewByToken)
  fastify.post('/links/:token/feedbacks', { preHandler: [authenticate] }, createFeedbackViaLink)
  fastify.post('/links/:token/feedbacks/audio', { preHandler: [authenticate, validateAudioUpload] }, createAudioFeedbackViaLink)
}
