import { FastifyInstance } from 'fastify'
import { authenticate } from '../middleware/authMiddleware.js'
import {
  MAX_UPLOAD_BYTES,
  ALLOWED_MIME_TYPES,
  limitesEfetivos,
} from '../config/uploadLimits.js'

/**
 * Limites de upload, para o frontend validar antes de enviar.
 *
 * Existe para que o navegador não precise repetir o número na mão. A validação
 * de verdade continua no servidor — esta rota é conveniência para avisar cedo,
 * não controle de acesso, e um cliente que a ignore esbarra no middleware
 * exatamente como antes.
 *
 * Os valores são os *efetivos*: já cortados pelo teto do multipart, e não a
 * promessa por categoria, que é maior do que o servidor aceita.
 */
export async function uploadRoutes(fastify: FastifyInstance) {
  fastify.get('/upload/limites', { preHandler: [authenticate] }, async () => ({
    data: {
      maxBytes: MAX_UPLOAD_BYTES,
      porCategoria: limitesEfetivos(),
      tiposPermitidos: ALLOWED_MIME_TYPES,
    },
    success: true,
  }))
}
