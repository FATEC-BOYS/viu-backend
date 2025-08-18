// src/routes/notificacoes.ts
import { FastifyInstance } from 'fastify'
import {
  listNotificacoes,
  getNotificacaoById,
  createNotificacao,
  markNotificacaoAsRead,
  deleteNotificacao,
} from '../controllers/notificacaoController.js'
import { authenticate } from '../middleware/authMiddleware.js'

export async function notificacoesRoutes(fastify: FastifyInstance) {
  // Listar notificações do usuário autenticado
  fastify.get('/notificacoes', { preHandler: [authenticate] }, listNotificacoes)
  // Buscar notificação específica do usuário
  fastify.get('/notificacoes/:id', { preHandler: [authenticate] }, getNotificacaoById)
  // Criar notificação (pode ser usado por processos internos/admin)
  fastify.post('/notificacoes', { preHandler: [authenticate] }, createNotificacao)
  // Marcar notificação como lida/não lida
  fastify.put('/notificacoes/:id/lida', { preHandler: [authenticate] }, markNotificacaoAsRead)
  // Excluir notificação do usuário
  fastify.delete('/notificacoes/:id', { preHandler: [authenticate] }, deleteNotificacao)
}