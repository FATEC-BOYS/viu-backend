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
  uploadAvatar,
} from '../controllers/usuarioController.js'
import {
  validateCreateUsuario,
  validateUpdateUsuario,
  validateLogin,
} from '../middleware/usuarioMiddleware.js'
import { authenticate } from '../middleware/authMiddleware.js'
import { requireOwnership, requireRole } from '../middleware/authorizationMiddleware.js'
import { validatePagination, validateCuidParam } from '../middleware/validationMiddleware.js'
import { validateFileUpload } from '../middleware/fileUploadMiddleware.js'

export async function usuariosRoutes(fastify: FastifyInstance) {
  fastify.get('/usuarios', { preHandler: [authenticate, requireRole('ADMIN'), validatePagination] }, listUsuarios)
  fastify.get('/usuarios/:id', { preHandler: [authenticate, validateCuidParam, requireOwnership('usuario')] }, getUsuarioById)

  fastify.post('/usuarios', {
    // 5 registros por IP a cada 15 min — evita criação em massa automatizada
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
    preHandler: [validateCreateUsuario],
  }, createUsuario)

  fastify.post('/auth/register', {
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
    preHandler: [validateCreateUsuario],
  }, createUsuario)

  fastify.post('/auth/login', {
    // 10 tentativas por IP a cada 15 min — bloqueia brute-force sem prejudicar usuário normal
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
    preHandler: [validateLogin],
  }, loginUsuario)

  fastify.get('/auth/me', { preHandler: [authenticate] }, getCurrentUser)

  fastify.put(
    '/usuarios/:id',
    { preHandler: [authenticate, validateCuidParam, requireOwnership('usuario'), validateUpdateUsuario] },
    updateUsuario,
  )

  fastify.delete('/usuarios/:id', { preHandler: [authenticate, validateCuidParam, requireOwnership('usuario')] }, deactivateUsuario)

  fastify.post('/usuarios/:id/avatar', {
    // 30 uploads de avatar por hora
    config: { rateLimit: { max: 30, timeWindow: '1 hour' } },
    preHandler: [authenticate, validateCuidParam, validateFileUpload],
  }, uploadAvatar)

  fastify.get('/usuarios/stats/overview', { preHandler: [authenticate, requireRole('ADMIN')] }, statsOverview)
}
