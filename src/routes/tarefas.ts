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
import { validateBody, validateCuidParam } from '../middleware/validationMiddleware.js'
import { CreateTarefaRequestSchema, UpdateTarefaRequestSchema } from '../schemas/validation.js'

export async function tarefasRoutes(fastify: FastifyInstance) {
  fastify.get('/tarefas', { preHandler: [authenticate] }, listTarefas)
  fastify.get('/tarefas/:id', { preHandler: [authenticate, validateCuidParam, requireProjectAccess] }, getTarefaById)
  fastify.post('/tarefas', {
    preHandler: [authenticate, validateBody(CreateTarefaRequestSchema), requireProjectAccess],
  }, createTarefa)
  fastify.put('/tarefas/:id', {
    preHandler: [authenticate, validateCuidParam, requireProjectAccess, validateBody(UpdateTarefaRequestSchema)],
  }, updateTarefa)
  fastify.delete('/tarefas/:id', { preHandler: [authenticate, validateCuidParam, requireProjectAccess] }, deleteTarefa)
}
