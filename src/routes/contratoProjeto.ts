import { FastifyInstance } from 'fastify'
import {
  getContratoVigenteHandler,
  historicoContratoHandler,
  gerarContratoHandler,
  aceitarContratoHandler,
} from '../controllers/contratoProjetoController.js'
import { authenticate } from '../middleware/authMiddleware.js'

/**
 * O contrato fica sob o projeto porque é dele; o aceite fica sob o contrato
 * porque é de uma versão específica. Essa segunda parte é o ponto: aceitar
 * "o contrato do projeto" sem dizer qual versão foi o que permitiu, antes, um
 * aceite sobrescrever o outro.
 */
export async function contratoProjetoRoutes(fastify: FastifyInstance) {
  fastify.get('/projetos/:projetoId/contrato', { preHandler: [authenticate] }, getContratoVigenteHandler)
  fastify.get('/projetos/:projetoId/contrato/versoes', { preHandler: [authenticate] }, historicoContratoHandler)
  fastify.post('/projetos/:projetoId/contrato', { preHandler: [authenticate] }, gerarContratoHandler)

  fastify.post('/contratos/:contratoId/aceite', { preHandler: [authenticate] }, aceitarContratoHandler)
}
