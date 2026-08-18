import { FastifyInstance } from 'fastify'
import { authenticate } from '../middleware/authMiddleware.js'
import { requireRole } from '../middleware/authorizationMiddleware.js'
import { validateCuidParam } from '../middleware/validationMiddleware.js'
import {
  listVinculosRompidos,
  romperVinculo,
  restaurarVinculo,
} from '../controllers/vinculoController.js'

export async function vinculosRoutes(app: FastifyInstance) {
  // Vínculos que o designer autenticado rompeu
  app.get('/vinculos/rompidos', { preHandler: [authenticate] }, listVinculosRompidos)

  // Romper e restaurar são sempre em nome do próprio designer — o id dele vem
  // do token, nunca do corpo da requisição.
  app.put('/vinculos/:clienteId/romper', {
    preHandler: [authenticate, requireRole('DESIGNER', 'ADMIN')],
  }, romperVinculo)

  app.put('/vinculos/:clienteId/restaurar', {
    preHandler: [authenticate, requireRole('DESIGNER', 'ADMIN')],
  }, restaurarVinculo)
}
