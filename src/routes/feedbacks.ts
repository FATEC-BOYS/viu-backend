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
  resolverThread,
  reabrirThread,
} from '../controllers/feedbackController.js'
import { authenticate } from '../middleware/authMiddleware.js'
import { chaveDoComentario } from '../utils/rateLimitComentario.js'
import { requireProjectAccess, requireAuthor } from '../middleware/authorizationMiddleware.js'
import { validateAudioUpload } from '../middleware/fileUploadMiddleware.js'
import { validateBody } from '../middleware/validationMiddleware.js'
import { CreateFeedbackRequestSchema } from '../schemas/validation.js'

export async function feedbacksRoutes(fastify: FastifyInstance) {
  fastify.get('/feedbacks', { preHandler: [authenticate] }, listFeedbacks)
  fastify.get('/feedbacks/:id', { preHandler: [authenticate, requireProjectAccess] }, getFeedbackById)
  fastify.get('/feedbacks/:id/audio', { preHandler: [authenticate, requireProjectAccess] }, getFeedbackAudio)
  fastify.get('/feedbacks/:id/transcricao', { preHandler: [authenticate, requireProjectAccess] }, getFeedbackTranscricao)
  fastify.post('/feedbacks', {
    // Chave por credencial e não por IP: comentar exige conta, então o IP pune
    // quem divide rede e não segura script atrás de IP rotativo.
    config: { rateLimit: { max: 20, timeWindow: '1 minute', keyGenerator: chaveDoComentario } },
    preHandler: [authenticate, requireProjectAccess, validateBody(CreateFeedbackRequestSchema)],
  }, createFeedback)
  // Audio upload: validateAudioUpload runs first to consume the multipart stream,
  // then requireProjectAccess can read arteId from request.audioData.fields
  fastify.post('/feedbacks/audio', {
    // 5 por minuto — OpenAI Whisper é cara; limite mais restrito que texto
    config: { rateLimit: { max: 5, timeWindow: '1 minute', keyGenerator: chaveDoComentario } },
    preHandler: [authenticate, validateAudioUpload, requireProjectAccess],
  }, createFeedbackComAudio)
  fastify.put('/feedbacks/:id', { preHandler: [authenticate, requireProjectAccess, requireAuthor] }, updateFeedback)
  fastify.delete('/feedbacks/:id', { preHandler: [authenticate, requireProjectAccess, requireAuthor] }, deleteFeedback)
  fastify.put('/feedbacks/:id/resolver', { preHandler: [authenticate, requireProjectAccess] }, resolverThread)
  fastify.put('/feedbacks/:id/reabrir', { preHandler: [authenticate, requireProjectAccess] }, reabrirThread)
}
