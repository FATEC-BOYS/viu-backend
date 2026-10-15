import { financeiroApenasAdmin } from '../middleware/financeiroMiddleware.js'
import { FastifyInstance } from 'fastify'
import {
  webhookPagamentoHandler,
  listarPagamentosHandler,
} from '../controllers/pagamentoController.js'
import { authenticate } from '../middleware/authMiddleware.js'

export async function pagamentosRoutes(fastify: FastifyInstance) {
  fastify.get('/pagamentos', { preHandler: [authenticate, financeiroApenasAdmin] }, listarPagamentosHandler)
  fastify.post('/pagamentos/webhook', webhookPagamentoHandler)
}
