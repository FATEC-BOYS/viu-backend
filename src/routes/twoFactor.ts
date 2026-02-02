/**
 * Rotas de Autenticação de Dois Fatores (2FA)
 */

import { FastifyInstance } from 'fastify'
import {
  setupTwoFactor,
  enableTwoFactor,
  disableTwoFactor,
  verifyTwoFactorCode,
  regenerateBackupCodes,
  getTwoFactorStatus,
  getTwoFactorStats,
} from '../controllers/twoFactorController.js'
import { authenticate } from '../middleware/authMiddleware.js'
import { requireRole } from '../middleware/authorizationMiddleware.js'
import { validateBody } from '../middleware/validationMiddleware.js'
import {
  EnableTwoFactorRequestSchema,
  DisableTwoFactorRequestSchema,
  VerifyTwoFactorCodeRequestSchema,
  RegenerateBackupCodesRequestSchema,
} from '../schemas/validation.js'

export async function twoFactorRoutes(fastify: FastifyInstance) {
  // Setup - Gera QR code para configuração inicial
  fastify.post('/2fa/setup', { preHandler: [authenticate] }, setupTwoFactor)

  // Enable - Verifica código e ativa 2FA
  fastify.post(
    '/2fa/enable',
    { preHandler: [authenticate, validateBody(EnableTwoFactorRequestSchema)] },
    enableTwoFactor,
  )

  // Disable - Desativa 2FA (requer senha)
  fastify.post(
    '/2fa/disable',
    { preHandler: [authenticate, validateBody(DisableTwoFactorRequestSchema)] },
    disableTwoFactor,
  )

  // Verify - Verifica código 2FA (usado no login)
  // Nota: Esta rota NÃO requer autenticação pois é usada durante o login
  fastify.post(
    '/2fa/verify',
    { preHandler: [validateBody(VerifyTwoFactorCodeRequestSchema)] },
    verifyTwoFactorCode,
  )

  // Regenerate backup codes
  fastify.post(
    '/2fa/regenerate-backup-codes',
    {
      preHandler: [
        authenticate,
        validateBody(RegenerateBackupCodesRequestSchema),
      ],
    },
    regenerateBackupCodes,
  )

  // Status - Verifica se usuário tem 2FA habilitado
  fastify.get('/2fa/status', { preHandler: [authenticate] }, getTwoFactorStatus)

  // Stats - Estatísticas de 2FA (apenas admins)
  fastify.get(
    '/2fa/stats',
    { preHandler: [authenticate, requireRole('ADMIN')] },
    getTwoFactorStats,
  )
}
