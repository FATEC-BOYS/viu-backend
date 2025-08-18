// src/routes/aprovacoes.ts
import { FastifyInstance } from 'fastify'
import {
  listAprovacoes,
  getAprovacaoById,
  createAprovacao,
  updateAprovacao,
  deleteAprovacao,
} from '../controllers/aprovacaoController.js'
import { authenticate } from '../middleware/authMiddleware.js'

export async function aprovacoesRoutes(fastify: FastifyInstance) {
  fastify.get('/aprovacoes', { preHandler: [authenticate] }, listAprovacoes)
  fastify.get('/aprovacoes/:id', { preHandler: [authenticate] }, getAprovacaoById)
  fastify.post('/aprovacoes', { preHandler: [authenticate] }, createAprovacao)
  fastify.put('/aprovacoes/:id', { preHandler: [authenticate] }, updateAprovacao)
  fastify.delete('/aprovacoes/:id', { preHandler: [authenticate] }, deleteAprovacao)
}