import { FastifyInstance } from 'fastify'
import { authenticate } from '../middleware/authMiddleware.js'
import { requirePermission } from '../middleware/authorizationMiddleware.js'
import { PERMISSOES } from '../utils/permissions.js'
import {
  criarEquipeConviteHandler,
  aceitarEquipeConviteHandler,
  recusarEquipeConviteHandler,
  listarEquipeConvitesPendentesHandler,
  getEquipeConviteByTokenHandler,
  listarConvitesDaEquipeHandler,
} from '../controllers/equipeConviteController.js'

export async function equipeConvitesRoutes(app: FastifyInstance) {
  // List pending team invites for the authenticated user
  app.get('/equipes/convites', { preHandler: [authenticate] }, listarEquipeConvitesPendentesHandler)

  // Get invite by token (public — used by the frontend invite page before login)
  app.get('/equipes/convites/:token', getEquipeConviteByTokenHandler)

  // Accept invite
  app.post('/equipes/convites/:token/aceitar', { preHandler: [authenticate] }, aceitarEquipeConviteHandler)

  // Decline invite
  app.post('/equipes/convites/:token/recusar', { preHandler: [authenticate] }, recusarEquipeConviteHandler)

  // List all invites for a specific team (leaders and admins only)
  app.get('/equipes/:id/convites', { preHandler: [authenticate] }, listarConvitesDaEquipeHandler)

  // Create a new invite for a team (leaders and admins only)
  app.post('/equipes/:id/convites', {
    preHandler: [authenticate, requirePermission(PERMISSOES.CONVIDAR_MEMBRO)],
  }, criarEquipeConviteHandler)
}
