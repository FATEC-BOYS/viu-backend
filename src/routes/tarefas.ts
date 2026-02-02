// src/routes/tarefas.ts
import { FastifyInstance } from 'fastify'
import {
  listTarefas,
  getTarefaById,
  createTarefa,
  updateTarefa,
  deleteTarefa,
} from '../controllers/tarefaController.js'
import { authenticate } from '../middleware/authMiddleware.js'
import { requireProjectAccess } from '../middleware/authorizationMiddleware.js'

export async function tarefasRoutes(fastify: FastifyInstance) {
  fastify.get('/tarefas', { preHandler: [authenticate] }, listTarefas)
  fastify.get('/tarefas/:id', { preHandler: [authenticate, requireProjectAccess] }, getTarefaById)
  fastify.post('/tarefas', { preHandler: [authenticate, requireProjectAccess] }, createTarefa)
  fastify.put('/tarefas/:id', { preHandler: [authenticate, requireProjectAccess] }, updateTarefa)
  fastify.delete('/tarefas/:id', { preHandler: [authenticate, requireProjectAccess] }, deleteTarefa)
}