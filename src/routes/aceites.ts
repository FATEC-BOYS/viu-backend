import { FastifyInstance } from 'fastify'
import { authenticate } from '../middleware/authMiddleware.js'
import { registrarAceite, verificarAceite, listarAceitesProjeto } from '../controllers/aceiteController.js'

export async function aceitesRoutes(app: FastifyInstance) {
  // Register acceptance of terms for a project
  app.post('/aceites', { preHandler: [authenticate] }, registrarAceite)

  // Check if the current user has accepted terms for a given project
  app.get('/aceites/projetos/:projetoId', { preHandler: [authenticate] }, verificarAceite)

  // List all acceptances for a project (admin / parties only)
  app.get('/aceites/projetos/:projetoId/todos', { preHandler: [authenticate] }, listarAceitesProjeto)
}
