// src/routes/sessoes.ts
import { FastifyInstance } from 'fastify'
import { listSessoes, revokeSessao } from '../controllers/sessaoController.js'
import { authenticate } from '../middleware/authMiddleware.js'

export async function sessoesRoutes(fastify: FastifyInstance) {
  fastify.get('/sessoes', { preHandler: [authenticate] }, listSessoes)
  fastify.delete('/sessoes/:id', { preHandler: [authenticate] }, revokeSessao)
}