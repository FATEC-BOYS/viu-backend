import { FastifyInstance } from 'fastify'
import {
  listAprovacoes,
  getAprovacaoById,
  createAprovacao,
  updateAprovacao,
  deleteAprovacao,
  lembrarAprovadorHandler,
  solicitarAprovacaoHandler,
} from '../controllers/aprovacaoController.js'
import { authenticate } from '../middleware/authMiddleware.js'
import { requirePermission, requireProjectAccess } from '../middleware/authorizationMiddleware.js'
import { validateBody, validateCuidParam } from '../middleware/validationMiddleware.js'
import { CreateAprovacaoRequestSchema } from '../schemas/validation.js'
import { PERMISSOES } from '../utils/permissions.js'

export async function aprovacoesRoutes(fastify: FastifyInstance) {
  fastify.get('/aprovacoes', { preHandler: [authenticate] }, listAprovacoes)
  fastify.get('/aprovacoes/:id', { preHandler: [authenticate, validateCuidParam] }, getAprovacaoById)
  fastify.post('/aprovacoes', {
    preHandler: [authenticate, requirePermission(PERMISSOES.APROVAR_ARTE), validateBody(CreateAprovacaoRequestSchema)],
  }, createAprovacao)
  fastify.put('/aprovacoes/:id', {
    preHandler: [authenticate, validateCuidParam],
  }, updateAprovacao)
  fastify.delete('/aprovacoes/:id', { preHandler: [authenticate, validateCuidParam] }, deleteAprovacao)

  // Lembrete ao aprovador — só notifica, não altera a aprovação
  fastify.put('/aprovacoes/:id/lembrar', { preHandler: [authenticate, validateCuidParam] }, lembrarAprovadorHandler)

  // Solicitar é o oposto de decidir: quem pede é o designer, quem responde é o
  // cliente. Por isso rota própria, sem requirePermission(APROVAR_ARTE) — essa
  // permissão é de quem decide, e o designer não a tem.
  fastify.post('/artes/:id/solicitar-aprovacao', {
    preHandler: [authenticate, validateCuidParam, requireProjectAccess],
  }, solicitarAprovacaoHandler)
}