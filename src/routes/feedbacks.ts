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
import { requireProjectAccess } from '../middleware/authorizationMiddleware.js'
import { validateAudioUpload } from '../middleware/fileUploadMiddleware.js'
import { validateBody } from '../middleware/validationMiddleware.js'
import { CreateFeedbackRequestSchema } from '../schemas/validation.js'

export async function feedbacksRoutes(fastify: FastifyInstance) {
  fastify.get('/feedbacks', { preHandler: [authenticate] }, listFeedbacks)
  fastify.get('/feedbacks/:id', { preHandler: [authenticate, requireProjectAccess] }, getFeedbackById)
  fastify.get('/feedbacks/:id/audio', { preHandler: [authenticate, requireProjectAccess] }, getFeedbackAudio)
  fastify.get('/feedbacks/:id/transcricao', { preHandler: [authenticate, requireProjectAccess] }, getFeedbackTranscricao)
  fastify.post('/feedbacks', {
    preHandler: [authenticate, requireProjectAccess, validateBody(CreateFeedbackRequestSchema)],
  }, createFeedback)
  // Audio upload: validateAudioUpload runs first to consume the multipart stream,
  // then requireProjectAccess can read arteId from request.audioData.fields
  fastify.post('/feedbacks/audio', {
    preHandler: [authenticate, validateAudioUpload, requireProjectAccess],
  }, createFeedbackComAudio)
  fastify.put('/feedbacks/:id', { preHandler: [authenticate, requireProjectAccess] }, updateFeedback)
  fastify.delete('/feedbacks/:id', { preHandler: [authenticate, requireProjectAccess] }, deleteFeedback)
}
