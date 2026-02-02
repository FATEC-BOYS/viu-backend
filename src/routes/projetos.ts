// src/routes/projetos.ts
/**
 * Definições das rotas de projetos
 *
 * Esta camada apenas registra as rotas e associa cada uma aos seus
 * respectivos controladores e middlewares. Manter a definição das
 * rotas separada simplifica a visualização do que está disponível na
 * API e facilita a composição de middlewares.
 */

import { FastifyInstance } from 'fastify'
import {
  listProjetos,
  getProjetoById,
  createProjeto,
  updateProjeto,
  deleteProjeto,
  dashboardStats,
  listProjetosByDesigner,
} from '../controllers/projetoController.js'
import {
  validateCreateProjeto,
  validateUpdateProjeto,
} from '../middleware/projetoMiddleware.js'
import { authenticate } from '../middleware/authMiddleware.js'
import { requireOwnership, requireRole } from '../middleware/authorizationMiddleware.js'
import { validatePagination, validateCuidParam } from '../middleware/validationMiddleware.js'

export async function projetosRoutes(fastify: FastifyInstance) {
  // Listagem com filtros e paginação (requer autenticação e validação)
  fastify.get('/projetos', { preHandler: [authenticate, validatePagination] }, listProjetos)
  // Detalhamento de projeto (requer autenticação, validação de ID e acesso ao projeto)
  fastify.get('/projetos/:id', { preHandler: [authenticate, validateCuidParam, requireOwnership('projeto')] }, getProjetoById)
  // Criação de projeto com validação (requer autenticação)
  fastify.post(
    '/projetos',
    {
      preHandler: [authenticate, validateCreateProjeto],
    },
    createProjeto,
  )
  // Atualização de projeto com validação (requer autenticação, validação de ID e ownership)
  fastify.put(
    '/projetos/:id',
    {
      preHandler: [authenticate, validateCuidParam, requireOwnership('projeto'), validateUpdateProjeto],
    },
    updateProjeto,
  )
  // Remoção de projeto (requer autenticação, validação de ID e ownership)
  fastify.delete('/projetos/:id', { preHandler: [authenticate, validateCuidParam, requireOwnership('projeto')] }, deleteProjeto)
  // Dashboard de estatísticas (requer autenticação e papel de ADMIN)
  fastify.get('/projetos/stats/dashboard', { preHandler: [authenticate, requireRole('ADMIN')] }, dashboardStats)
  // Listagem por designer (requer autenticação e validação de ID)
  fastify.get('/designers/:designerId/projetos', { preHandler: [authenticate, validateCuidParam] }, listProjetosByDesigner)
}