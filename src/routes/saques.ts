import { FastifyInstance } from 'fastify'
import {
  listarChavesPixHandler,
  cadastrarChavePixHandler,
  removerChavePixHandler,
  getSaldoHandler,
  solicitarSaqueHandler,
  listarSaquesHandler,
} from '../controllers/saqueController.js'
import { authenticate } from '../middleware/authMiddleware.js'

export async function saquesRoutes(fastify: FastifyInstance) {
  fastify.get('/saques/saldo', { preHandler: [authenticate] }, getSaldoHandler)
  fastify.get('/saques', { preHandler: [authenticate] }, listarSaquesHandler)
  fastify.post('/saques', { preHandler: [authenticate] }, solicitarSaqueHandler)
  fastify.get('/chaves-pix', { preHandler: [authenticate] }, listarChavesPixHandler)
  fastify.post('/chaves-pix', { preHandler: [authenticate] }, cadastrarChavePixHandler)
  fastify.delete('/chaves-pix/:id', { preHandler: [authenticate] }, removerChavePixHandler)
}
