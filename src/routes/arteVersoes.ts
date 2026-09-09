import { FastifyInstance } from 'fastify'
import {
  listarVersoes,
  getVersaoById,
  uploadNovaVersao,
  restaurarVersao,
} from '../controllers/arteVersaoController.js'
import { authenticate } from '../middleware/authMiddleware.js'
import { requireProjectAccess } from '../middleware/authorizationMiddleware.js'
import { validateArteVersaoUpload } from '../middleware/fileUploadMiddleware.js'
import { requireEmailVerificado } from '../middleware/emailVerificadoMiddleware.js'

export async function arteVersoesRoutes(fastify: FastifyInstance) {
  fastify.get('/artes/:id/versoes', { preHandler: [authenticate, requireProjectAccess] }, listarVersoes)
  fastify.get('/artes/:id/versoes/:versaoId', { preHandler: [authenticate, requireProjectAccess] }, getVersaoById)
  fastify.post('/artes/:id/versoes/upload', {
    config: { rateLimit: { max: 20, timeWindow: '1 hour' } },
    preHandler: [authenticate, requireEmailVerificado, requireProjectAccess, validateArteVersaoUpload],
  }, uploadNovaVersao)
  fastify.post('/artes/:id/versoes/:versaoId/restaurar', { preHandler: [authenticate, requireProjectAccess] }, restaurarVersao)
}
