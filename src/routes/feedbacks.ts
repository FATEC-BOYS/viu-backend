// src/routes/feedbacks.ts
import { FastifyInstance } from 'fastify'
import {
  listFeedbacks,
  getFeedbackById,
  createFeedback,
  updateFeedback,
  deleteFeedback,
} from '../controllers/feedbackController.js'
import { authenticate } from '../middleware/authMiddleware.js'

export async function feedbacksRoutes(fastify: FastifyInstance) {
  fastify.get('/feedbacks', { preHandler: [authenticate] }, listFeedbacks)
  fastify.get('/feedbacks/:id', { preHandler: [authenticate] }, getFeedbackById)
  fastify.post('/feedbacks', { preHandler: [authenticate] }, createFeedback)
  fastify.put('/feedbacks/:id', { preHandler: [authenticate] }, updateFeedback)
  fastify.delete('/feedbacks/:id', { preHandler: [authenticate] }, deleteFeedback)
}