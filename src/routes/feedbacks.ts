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

export async function feedbacksRoutes(fastify: FastifyInstance) {
  fastify.get('/feedbacks', { preHandler: [authenticate] }, listFeedbacks)
  fastify.get('/feedbacks/:id', { preHandler: [authenticate] }, getFeedbackById)
  fastify.get('/feedbacks/:id/audio', { preHandler: [authenticate] }, getFeedbackAudio)
  fastify.get('/feedbacks/:id/transcricao', { preHandler: [authenticate] }, getFeedbackTranscricao)
  fastify.post('/feedbacks', { preHandler: [authenticate] }, createFeedback)
  fastify.post('/feedbacks/audio', { preHandler: [authenticate] }, createFeedbackComAudio)
  fastify.put('/feedbacks/:id', { preHandler: [authenticate] }, updateFeedback)
  fastify.delete('/feedbacks/:id', { preHandler: [authenticate] }, deleteFeedback)
}
