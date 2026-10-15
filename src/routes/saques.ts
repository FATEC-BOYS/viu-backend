import { financeiroApenasAdmin } from '../middleware/financeiroMiddleware.js'
import { FastifyInstance } from 'fastify'
import {
  listarChavesPixHandler,
  cadastrarChavePixHandler,
  removerChavePixHandler,
  getSaldoHandler,
  solicitarSaqueHandler,
  listarSaquesHandler,
  listarSaquesAdminHandler,
  processarSaqueHandler,
  listarLedgerHandler,
} from '../controllers/saqueController.js'
import { authenticate } from '../middleware/authMiddleware.js'
import { requireRole, requirePermission } from '../middleware/authorizationMiddleware.js'
import { validateBody } from '../middleware/validationMiddleware.js'
import { SolicitarSaqueSchema, CadastrarChavePixSchema } from '../schemas/validation.js'
import { PERMISSOES } from '../utils/permissions.js'

export async function saquesRoutes(fastify: FastifyInstance) {
  fastify.get('/saques/saldo', { preHandler: [authenticate, financeiroApenasAdmin] }, getSaldoHandler)
  fastify.get('/saques', { preHandler: [authenticate, financeiroApenasAdmin] }, listarSaquesHandler)
  fastify.post('/saques', {
    // Saques são operações financeiras raras — 5/hora previne automação abusiva
    config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
    preHandler: [authenticate, financeiroApenasAdmin, requirePermission(PERMISSOES.EDITAR_FINANCEIRO), validateBody(SolicitarSaqueSchema)],
  }, solicitarSaqueHandler)
  fastify.get('/chaves-pix', { preHandler: [authenticate, financeiroApenasAdmin] }, listarChavesPixHandler)
  fastify.post('/chaves-pix', { preHandler: [authenticate, financeiroApenasAdmin, validateBody(CadastrarChavePixSchema)] }, cadastrarChavePixHandler)
  fastify.delete('/chaves-pix/:id', { preHandler: [authenticate, financeiroApenasAdmin] }, removerChavePixHandler)

  // Admin: visualizar e processar saques de todos os designers
  fastify.get('/admin/saques', { preHandler: [authenticate, financeiroApenasAdmin, requireRole('ADMIN')] }, listarSaquesAdminHandler)
  fastify.put('/admin/saques/:id/status', { preHandler: [authenticate, financeiroApenasAdmin, requireRole('ADMIN')] }, processarSaqueHandler)

  // Ledger: extrato financeiro imutável (designers veem o próprio; admins podem ver qualquer um)
  fastify.get('/ledger', { preHandler: [authenticate, financeiroApenasAdmin] }, listarLedgerHandler)
  fastify.get('/ledger/:designerId', { preHandler: [authenticate, financeiroApenasAdmin] }, listarLedgerHandler)
}
