// src/routes/notificacoes.ts
import { FastifyInstance } from 'fastify'
import {
  listNotificacoes,
  getNotificacaoById,
  createNotificacao,
  markNotificacaoAsRead,
  markAllNotificacoesAsRead,
  deleteNotificacao,
} from '../controllers/notificacaoController.js'
import { authenticate } from '../middleware/authMiddleware.js'
import { requireRole } from '../middleware/authorizationMiddleware.js'

export async function notificacoesRoutes(fastify: FastifyInstance) {
  fastify.get('/notificacoes', { preHandler: [authenticate] }, listNotificacoes)
  fastify.get('/notificacoes/:id', { preHandler: [authenticate] }, getNotificacaoById)
  // Admin-only: direct creation for system messages
  fastify.post('/notificacoes', { preHandler: [authenticate, requireRole('ADMIN')] }, createNotificacao)
  fastify.put('/notificacoes/:id/lida', { preHandler: [authenticate] }, markNotificacaoAsRead)
  // Mark all as read in one shot — used by notification bell "mark all read"
  fastify.put('/notificacoes/lidas/todas', { preHandler: [authenticate] }, markAllNotificacoesAsRead)
  fastify.delete('/notificacoes/:id', { preHandler: [authenticate] }, deleteNotificacao)
}