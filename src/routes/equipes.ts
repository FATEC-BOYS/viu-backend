import { FastifyInstance } from 'fastify'
import {
  criarEquipeHandler,
  listarEquipesHandler,
  getEquipeHandler,
  atualizarEquipeHandler,
  deletarEquipeHandler,
  adicionarMembroHandler,
  removerMembroHandler,
  atualizarPapelHandler,
  vincularProjetoHandler,
  desvincularProjetoHandler,
} from '../controllers/equipeController.js'
import { authenticate } from '../middleware/authMiddleware.js'
import { validateBody, validateCuidParam } from '../middleware/validationMiddleware.js'
import {
  CriarEquipeSchema,
  AtualizarEquipeSchema,
  AdicionarMembroSchema,
  AtualizarPapelSchema,
  VincularProjetoSchema,
} from '../schemas/validation.js'

export async function equipesRoutes(fastify: FastifyInstance) {
  fastify.get('/equipes', { preHandler: [authenticate] }, listarEquipesHandler)
  fastify.post('/equipes', { preHandler: [authenticate, validateBody(CriarEquipeSchema)] }, criarEquipeHandler)
  fastify.get('/equipes/:id', { preHandler: [authenticate, validateCuidParam] }, getEquipeHandler)
  fastify.put('/equipes/:id', { preHandler: [authenticate, validateCuidParam, validateBody(AtualizarEquipeSchema)] }, atualizarEquipeHandler)
  fastify.delete('/equipes/:id', { preHandler: [authenticate, validateCuidParam] }, deletarEquipeHandler)

  // Membros
  fastify.post('/equipes/:id/membros', {
    preHandler: [authenticate, validateCuidParam, validateBody(AdicionarMembroSchema)],
  }, adicionarMembroHandler)

  fastify.delete('/equipes/:id/membros/:usuarioId', {
    preHandler: [authenticate, validateCuidParam],
  }, removerMembroHandler)

  fastify.patch('/equipes/:id/membros/:usuarioId', {
    preHandler: [authenticate, validateCuidParam, validateBody(AtualizarPapelSchema)],
  }, atualizarPapelHandler)

  // Projetos
  fastify.post('/equipes/:id/projetos', {
    preHandler: [authenticate, validateCuidParam, validateBody(VincularProjetoSchema)],
  }, vincularProjetoHandler)

  fastify.delete('/equipes/:id/projetos/:projetoId', {
    preHandler: [authenticate, validateCuidParam],
  }, desvincularProjetoHandler)
}
