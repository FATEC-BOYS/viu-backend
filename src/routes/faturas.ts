import { FastifyInstance } from 'fastify'
import {
  criarFaturaHandler,
  pagarFaturaPixHandler,
  listarFaturasHandler,
  getFaturaHandler,
  cancelarFaturaHandler,
} from '../controllers/faturaController.js'
import { authenticate } from '../middleware/authMiddleware.js'

export async function faturasRoutes(fastify: FastifyInstance) {
  fastify.get('/faturas', { preHandler: [authenticate] }, listarFaturasHandler)
  fastify.get('/faturas/:id', { preHandler: [authenticate] }, getFaturaHandler)
  fastify.post('/projetos/:id/fatura', { preHandler: [authenticate] }, criarFaturaHandler)
  fastify.post('/faturas/:id/pagar/pix', { preHandler: [authenticate] }, pagarFaturaPixHandler)
  fastify.delete('/faturas/:id', { preHandler: [authenticate] }, cancelarFaturaHandler)
}
