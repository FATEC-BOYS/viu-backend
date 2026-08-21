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
  aceitarEquipeConvitePorIdHandler,
  recusarEquipeConvitePorIdHandler,
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

  // Responder pelo id do convite — a lista de pendentes não tem o token cru,
  // que só existe no e-mail. O segmento fixo 'id' evita colidir com :token.
  app.post('/equipes/convites/id/:conviteId/aceitar', { preHandler: [authenticate] }, aceitarEquipeConvitePorIdHandler)
  app.post('/equipes/convites/id/:conviteId/recusar', { preHandler: [authenticate] }, recusarEquipeConvitePorIdHandler)

  // List all invites for a specific team (leaders and admins only)
  app.get('/equipes/:id/convites', { preHandler: [authenticate] }, listarConvitesDaEquipeHandler)

  // Create a new invite for a team (leaders and admins only)
  app.post('/equipes/:id/convites', {
    preHandler: [authenticate, requirePermission(PERMISSOES.CONVIDAR_MEMBRO)],
  }, criarEquipeConviteHandler)
}
