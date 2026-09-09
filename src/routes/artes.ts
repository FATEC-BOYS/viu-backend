import { FastifyInstance } from 'fastify'
import {
  listArtes,
  getArteById,
  updateArte,
  deleteArte,
  uploadAndCreateArte,
} from '../controllers/arteController.js'
import { authenticate } from '../middleware/authMiddleware.js'
import { requireProjectAccess } from '../middleware/authorizationMiddleware.js'
import { validateCuidParam } from '../middleware/validationMiddleware.js'
import { validateArteUpload } from '../middleware/fileUploadMiddleware.js'
import { requirePlanLimit } from '../middleware/planLimitMiddleware.js'
import { requireEmailVerificado } from '../middleware/emailVerificadoMiddleware.js'

export async function artesRoutes(fastify: FastifyInstance) {
  fastify.get('/artes', { preHandler: [authenticate] }, listArtes)

  // /artes/upload must be registered before /artes/:id to avoid param collision
  fastify.post('/artes/upload', {
    // 30 uploads por hora por IP — o produto precisa de fluxo, mas não de rajadas automatizadas
    config: { rateLimit: { max: 30, timeWindow: '1 hour' } },
    preHandler: [authenticate, requireEmailVerificado, requirePlanLimit('artes'), validateArteUpload],
  }, uploadAndCreateArte)

  fastify.get('/artes/:id', { preHandler: [authenticate, validateCuidParam, requireProjectAccess] }, getArteById)
  fastify.put('/artes/:id', { preHandler: [authenticate, validateCuidParam, requireProjectAccess] }, updateArte)
  fastify.delete('/artes/:id', { preHandler: [authenticate, validateCuidParam, requireProjectAccess] }, deleteArte)
}
