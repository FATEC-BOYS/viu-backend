import { FastifyInstance } from 'fastify'
import { authenticate } from '../middleware/authMiddleware.js'
import { requireProjectAccess } from '../middleware/authorizationMiddleware.js'
import {
  createConvite,
  getConvite,
  listarConvites,
  aceitarConviteHandler,
  recusarConviteHandler,
} from '../controllers/conviteController.js'

export async function convitesRoutes(app: FastifyInstance) {
  // List pending invites for the authenticated user
  app.get('/convites', { preHandler: [authenticate] }, listarConvites)

  // Get invite by token (public — used by the frontend invite page before login)
  app.get('/convites/:token', getConvite)

  // Accept invite
  app.post('/convites/:token/aceitar', { preHandler: [authenticate] }, aceitarConviteHandler)

  // Decline invite
  app.post('/convites/:token/recusar', { preHandler: [authenticate] }, recusarConviteHandler)

  // Create a new invite for a project (project participant only)
  app.post('/projetos/:projetoId/convites', {
    preHandler: [authenticate, requireProjectAccess],
  }, createConvite)
}
