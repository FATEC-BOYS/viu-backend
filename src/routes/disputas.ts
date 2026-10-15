import { financeiroApenasAdmin } from '../middleware/financeiroMiddleware.js'
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
  app.post('/disputas', { preHandler: [authenticate, financeiroApenasAdmin] }, abrirDisputa)

  // List disputes (admins see all; users see own)
  app.get('/disputas', { preHandler: [authenticate, financeiroApenasAdmin] }, listarDisputas)

  // Get a specific dispute
  app.get('/disputas/:id', { preHandler: [authenticate, financeiroApenasAdmin] }, getDisputaById)

  // Move to EM_ANALISE (admin)
  app.put('/disputas/:id/analisar', { preHandler: [authenticate, financeiroApenasAdmin] }, moverParaAnalise)

  // Resolve a dispute (admin only)
  app.put('/disputas/:id/resolver', { preHandler: [authenticate, financeiroApenasAdmin] }, resolverDisputa)
}
