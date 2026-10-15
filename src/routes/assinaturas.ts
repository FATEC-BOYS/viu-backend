import { financeiroApenasAdmin } from '../middleware/financeiroMiddleware.js'
import { FastifyInstance } from 'fastify'
import {
  getMinhaAssinaturaHandler,
  criarAssinaturaHandler,
  cancelarAssinaturaHandler,
  webhookAssinaturaHandler,
} from '../controllers/assinaturaController.js'
import { authenticate } from '../middleware/authMiddleware.js'

export async function assinaturasRoutes(fastify: FastifyInstance) {
  fastify.get('/assinaturas/minha', { preHandler: [authenticate, financeiroApenasAdmin] }, getMinhaAssinaturaHandler)
  fastify.post('/assinaturas', { preHandler: [authenticate, financeiroApenasAdmin] }, criarAssinaturaHandler)
  fastify.put('/assinaturas/:id/cancelar', { preHandler: [authenticate, financeiroApenasAdmin] }, cancelarAssinaturaHandler)
  fastify.post('/assinaturas/webhook', webhookAssinaturaHandler)
}
