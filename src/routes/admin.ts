import { FastifyInstance } from 'fastify'
import { getResumoAdmin } from '../controllers/adminController.js'
import { authenticate } from '../middleware/authMiddleware.js'
import { requireRole } from '../middleware/authorizationMiddleware.js'

export async function adminRoutes(fastify: FastifyInstance) {
  // A home do admin em uma requisição: seis contagens, o funil e duas listas.
  // Agregação pura — pesa mais que uma leitura comum, daí o teto próprio.
  fastify.get('/admin/resumo', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    preHandler: [authenticate, requireRole('ADMIN')],
  }, getResumoAdmin)
}
