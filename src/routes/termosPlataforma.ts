import { FastifyInstance } from 'fastify'
import {
  getTermos,
  getAceiteTermos,
  postAceiteTermos,
} from '../controllers/termosPlataformaController.js'
import { authenticate } from '../middleware/authMiddleware.js'

export async function termosPlataformaRoutes(app: FastifyInstance) {
  // Sem `authenticate`: quem ainda não tem conta precisa poder ler o que vai
  // aceitar para criá-la.
  app.get('/termos', {}, getTermos)

  app.get('/termos/aceite', { preHandler: [authenticate] }, getAceiteTermos)
  app.post('/termos/aceite', { preHandler: [authenticate] }, postAceiteTermos)
}
