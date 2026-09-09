import { FastifyInstance } from 'fastify'
import { env } from '../config/env.js'
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
  buscarUsuarios,
} from '../controllers/usuarioController.js'
import {
  validateCreateUsuario,
  validateUpdateUsuario,
  validateLogin,
  restringirCriacaoACliente,
} from '../middleware/usuarioMiddleware.js'
import { authenticate } from '../middleware/authMiddleware.js'
import { requireOwnership, requireRole } from '../middleware/authorizationMiddleware.js'
import { validatePagination, validateCuidParam } from '../middleware/validationMiddleware.js'
import {
  limitarRegistroPublico,
  limitarCriacaoDeCliente,
} from '../middleware/registroLimiteMiddleware.js'
import { verificarCaptchaDoCadastro } from '../middleware/captchaMiddleware.js'
import { validateFileUpload } from '../middleware/fileUploadMiddleware.js'

export async function usuariosRoutes(fastify: FastifyInstance) {
  fastify.get('/usuarios', { preHandler: [authenticate, requireRole('ADMIN'), validatePagination] }, listUsuarios)

  // busca leve para typeahead (qualquer usuário autenticado, campos mínimos)
  fastify.get('/usuarios/buscar', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    preHandler: [authenticate],
  }, buscarUsuarios)

  fastify.get('/usuarios/:id', { preHandler: [authenticate, validateCuidParam, requireOwnership('usuario')] }, getUsuarioById)

  // Cadastro de cliente pelo designer (ClienteWizard). Não é porta de
  // cadastro público: exige sessão e só cria CLIENTE. Sem isso, o mesmo
  // handler do registro ficava acessível sem autenticação, com balde de
  // limite próprio — alternar as duas rotas dobrava o teto de contas por IP.
  fastify.post('/usuarios', {
    preHandler: [authenticate, restringirCriacaoACliente, limitarCriacaoDeCliente, validateCreateUsuario],
  }, createUsuario)

  // Única porta pública de cadastro. O limite por hora e o teto diário vivem
  // no middleware porque precisam valer para o conjunto, não por rota.
  fastify.post('/auth/register', {
    preHandler: [limitarRegistroPublico, verificarCaptchaDoCadastro, validateCreateUsuario],
  }, createUsuario)

  fastify.post('/auth/login', {
    // Teto por IP a cada 15 min — bloqueia brute-force sem prejudicar usuário
    // normal. Ajustável por env porque o valor certo depende de quantas
    // pessoas dividem o mesmo IP de saída.
    config: { rateLimit: { max: env.LOGIN_MAX_15MIN, timeWindow: '15 minutes' } },
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
