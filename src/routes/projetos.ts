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

export async function projetosRoutes(fastify: FastifyInstance) {
  // Listagem com filtros e paginação
  fastify.get('/projetos', listProjetos)
  // Detalhamento de projeto
  fastify.get('/projetos/:id', getProjetoById)
  // Criação de projeto com validação
  fastify.post(
    '/projetos',
    {
      preHandler: [validateCreateProjeto],
    },
    createProjeto,
  )
  // Atualização de projeto com validação
  fastify.put(
    '/projetos/:id',
    {
      preHandler: [validateUpdateProjeto],
    },
    updateProjeto,
  )
  // Remoção de projeto
  fastify.delete('/projetos/:id', deleteProjeto)
  // Dashboard de estatísticas
  fastify.get('/projetos/stats/dashboard', dashboardStats)
  // Listagem por designer
  fastify.get('/designers/:designerId/projetos', listProjetosByDesigner)
}