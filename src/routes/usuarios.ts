// src/routes/usuarios.ts
/**
 * Definições das rotas de usuários
 *
 * Este arquivo mapeia as URLs às funções de controller e aplica
 * middlewares de validação quando necessário. Mantê-lo separado da
 * implementação facilita a leitura e a manutenção das rotas disponíveis.
 */
import { FastifyInstance } from 'fastify'
import {
  listUsuarios,
  getUsuarioById,
  createUsuario,
  updateUsuario,
  deactivateUsuario,
  loginUsuario,
  getCurrentUser, 
  statsOverview,
} from '../controllers/usuarioController.js'
import {
  validateCreateUsuario,
  validateUpdateUsuario,
  validateLogin,
} from '../middleware/usuarioMiddleware.js'
import { authenticate } from '../middleware/authMiddleware.js'
import { requireOwnership, requireRole } from '../middleware/authorizationMiddleware.js'
import { validatePagination, validateCuidParam } from '../middleware/validationMiddleware.js'

export async function usuariosRoutes(fastify: FastifyInstance) {
  // Listagem de usuários (requer autenticação e validação)
  fastify.get('/usuarios', { preHandler: [authenticate, validatePagination] }, listUsuarios)

  // Detalhes de usuário (requer autenticação e validação de ID)
  fastify.get('/usuarios/:id', { preHandler: [authenticate, validateCuidParam] }, getUsuarioById)

  // Criação de usuário (público para registro)
  fastify.post(
    '/usuarios',
    { preHandler: [validateCreateUsuario] },
    createUsuario,
  )

  // Registro (alias para criação de usuário - compatibilidade com frontend)
  fastify.post(
    '/auth/register',
    { preHandler: [validateCreateUsuario] },
    createUsuario,
  )

  // Atualização de usuário (requer autenticação, validação de ID e ownership)
  fastify.put(
    '/usuarios/:id',
    { preHandler: [authenticate, validateCuidParam, requireOwnership('usuario'), validateUpdateUsuario] },
    updateUsuario,
  )

  // Desativação de usuário (soft delete - requer autenticação, validação de ID e ownership)
  fastify.delete('/usuarios/:id', { preHandler: [authenticate, validateCuidParam, requireOwnership('usuario')] }, deactivateUsuario)

  // Login
  fastify.post(
    '/auth/login',
    { preHandler: [validateLogin] },
    loginUsuario,
  )

  // <-- CORREÇÃO: Rota para obter o usuário autenticado adicionada
  // Usuário atual (me)
  fastify.get('/auth/me', { preHandler: [authenticate] }, getCurrentUser)

  // Estatísticas de usuários (requer autenticação e papel de ADMIN)
  fastify.get('/usuarios/stats/overview', { preHandler: [authenticate, requireRole('ADMIN')] }, statsOverview)
}
