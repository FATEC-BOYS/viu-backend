import { FastifyInstance } from 'fastify'
import { authenticate } from '../middleware/authMiddleware.js'
import { requireProjectAccess } from '../middleware/authorizationMiddleware.js'
import {
  createConvite,
  getConvite,
  listarConvites,
  aceitarConviteHandler,
  listarConvitesDoProjetoHandler,
  recusarConviteHandler,
  aceitarConvitePorIdHandler,
  recusarConvitePorIdHandler,
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

  // Responder pelo id do convite — a lista de pendentes não tem o token cru,
  // que só existe no e-mail. O segmento fixo 'id' evita colidir com :token.
  app.post('/convites/id/:conviteId/aceitar', { preHandler: [authenticate] }, aceitarConvitePorIdHandler)
  app.post('/convites/id/:conviteId/recusar', { preHandler: [authenticate] }, recusarConvitePorIdHandler)

  // Create a new invite for a project (project participant only)
  // Convites de um projeto (aba de pessoas)
  app.get('/projetos/:projetoId/convites', {
    preHandler: [authenticate, requireProjectAccess],
  }, listarConvitesDoProjetoHandler)

  app.post('/projetos/:projetoId/convites', {
    preHandler: [authenticate, requireProjectAccess],
  }, createConvite)
}
