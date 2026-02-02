// src/routes/feedbacks.ts
import { FastifyInstance } from 'fastify'
import {
  listFeedbacks,
  getFeedbackById,
  createFeedback,
  createFeedbackComAudio,
  getFeedbackAudio,
  getFeedbackTranscricao,
  updateFeedback,
  deleteFeedback,
} from '../controllers/feedbackController.js'
import { authenticate } from '../middleware/authMiddleware.js'
import { requireProjectAccess, requireAuthor } from '../middleware/authorizationMiddleware.js'
import { validateAudioUpload } from '../middleware/fileUploadMiddleware.js'

export async function feedbacksRoutes(fastify: FastifyInstance) {
  fastify.get('/feedbacks', { preHandler: [authenticate] }, listFeedbacks)
  fastify.get('/feedbacks/:id', { preHandler: [authenticate, requireProjectAccess] }, getFeedbackById)
  fastify.get('/feedbacks/:id/audio', { preHandler: [authenticate, requireProjectAccess] }, getFeedbackAudio)
  fastify.get('/feedbacks/:id/transcricao', { preHandler: [authenticate, requireProjectAccess] }, getFeedbackTranscricao)
  fastify.post('/feedbacks', { preHandler: [authenticate, requireProjectAccess] }, createFeedback)
  // Upload de áudio requer validação adicional de arquivo
  fastify.post('/feedbacks/audio', { preHandler: [authenticate, requireProjectAccess, validateAudioUpload] }, createFeedbackComAudio)
  fastify.put('/feedbacks/:id', { preHandler: [authenticate, requireAuthor] }, updateFeedback)
  fastify.delete('/feedbacks/:id', { preHandler: [authenticate, requireAuthor] }, deleteFeedback)
}
