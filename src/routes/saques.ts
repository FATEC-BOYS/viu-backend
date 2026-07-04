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
import { validateBody } from '../middleware/validationMiddleware.js'
import { SolicitarSaqueSchema, CadastrarChavePixSchema } from '../schemas/validation.js'

export async function saquesRoutes(fastify: FastifyInstance) {
  fastify.get('/saques/saldo', { preHandler: [authenticate] }, getSaldoHandler)
  fastify.get('/saques', { preHandler: [authenticate] }, listarSaquesHandler)
  fastify.post('/saques', { preHandler: [authenticate, validateBody(SolicitarSaqueSchema)] }, solicitarSaqueHandler)
  fastify.get('/chaves-pix', { preHandler: [authenticate] }, listarChavesPixHandler)
  fastify.post('/chaves-pix', { preHandler: [authenticate, validateBody(CadastrarChavePixSchema)] }, cadastrarChavePixHandler)
  fastify.delete('/chaves-pix/:id', { preHandler: [authenticate] }, removerChavePixHandler)

  // Admin: visualizar e processar saques de todos os designers
  fastify.get('/admin/saques', { preHandler: [authenticate] }, listarSaquesAdminHandler)
  fastify.put('/admin/saques/:id/status', { preHandler: [authenticate] }, processarSaqueHandler)

  // Ledger: extrato financeiro imutável (designers veem o próprio; admins podem ver qualquer um)
  fastify.get('/ledger', { preHandler: [authenticate] }, listarLedgerHandler)
  fastify.get('/ledger/:designerId', { preHandler: [authenticate] }, listarLedgerHandler)
}
