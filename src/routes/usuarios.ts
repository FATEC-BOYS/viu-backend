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

export async function usuariosRoutes(fastify: FastifyInstance) {
  // Listagem de usuários
  fastify.get('/usuarios', listUsuarios)
  
  // Detalhes de usuário
  fastify.get('/usuarios/:id', getUsuarioById)
  
  // Criação de usuário
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
  
  // Atualização de usuário
  fastify.put(
    '/usuarios/:id',
    { preHandler: [validateUpdateUsuario] },
    updateUsuario,
  )
  
  // Desativação de usuário (soft delete)
  fastify.delete('/usuarios/:id', deactivateUsuario)
  
  // Login
  fastify.post(
    '/auth/login',
    { preHandler: [validateLogin] },
    loginUsuario,
  )

  // <-- CORREÇÃO: Rota para obter o usuário autenticado adicionada
  // Usuário atual (me)
  fastify.get('/auth/me', getCurrentUser)
  
  // Estatísticas de usuários
  fastify.get('/usuarios/stats/overview', statsOverview)
}
