import { FastifyInstance } from 'fastify'
import {
  getTermosHandler,
  salvarTermosHandler,
  previewAnexoHandler,
} from '../controllers/termosProjetoController.js'
import { authenticate } from '../middleware/authMiddleware.js'
import { validateBody } from '../middleware/validationMiddleware.js'
import { TermosProjetoSchema } from '../schemas/validation.js'

/**
 * Os termos ficam sob o projeto porque é a ele que pertencem — não existe
 * "termo" solto que faça sentido consultar. Quem pode ler são as duas partes
 * (o cliente precisa, é ele quem aceita); quem pode gravar é só o designer ou
 * um ADMIN, checado no serviço.
 */
export async function termosProjetoRoutes(fastify: FastifyInstance) {
  fastify.get('/projetos/:projetoId/termos', { preHandler: [authenticate] }, getTermosHandler)

  fastify.put(
    '/projetos/:projetoId/termos',
    { preHandler: [authenticate, validateBody(TermosProjetoSchema)] },
    salvarTermosHandler,
  )

  // Prévia do anexo com os termos atuais. Não é o contrato: o que vale é o
  // `ContratoProjeto`, com texto congelado e hash.
  fastify.get('/projetos/:projetoId/anexo/preview', { preHandler: [authenticate] }, previewAnexoHandler)
}
