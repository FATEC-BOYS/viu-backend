import { FastifyInstance } from 'fastify'
import { authenticate } from '../middleware/authMiddleware.js'
import {
  abrirDisputa,
  listarDisputas,
  getDisputaById,
  resolverDisputa,
  moverParaAnalise,
} from '../controllers/disputaController.js'

export async function disputasRoutes(app: FastifyInstance) {
  // Open a new dispute
  app.post('/disputas', { preHandler: [authenticate] }, abrirDisputa)

  // List disputes (admins see all; users see own)
  app.get('/disputas', { preHandler: [authenticate] }, listarDisputas)

  // Get a specific dispute
  app.get('/disputas/:id', { preHandler: [authenticate] }, getDisputaById)

  // Move to EM_ANALISE (admin)
  app.put('/disputas/:id/analisar', { preHandler: [authenticate] }, moverParaAnalise)

  // Resolve a dispute (admin only)
  app.put('/disputas/:id/resolver', { preHandler: [authenticate] }, resolverDisputa)
}
