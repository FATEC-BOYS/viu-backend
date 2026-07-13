import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  criarEnvioAprovacaoHandler,
  listarEnviosHandler,
  verificarWebhookWhatsAppHandler,
  webhookWhatsAppHandler,
} from '../controllers/whatsappController.js'
import { authenticate } from '../middleware/authMiddleware.js'
import { validateBody } from '../middleware/validationMiddleware.js'

const CreateWhatsAppEnvioSchema = z.object({
  arteId: z.string().min(1, 'arteId é obrigatório'),
  linkPreview: z.string().url().optional(),
})

export async function whatsappRoutes(fastify: FastifyInstance) {
  // A validação de X-Hub-Signature-256 exige o corpo BRUTO (o hash é do byte
  // stream, não do JSON re-serializado). Este parser é encapsulado no escopo
  // deste plugin — as demais rotas seguem com o parser padrão do Fastify.
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (request, body, done) => {
      ;(request as any).rawBody = body as Buffer
      try {
        done(null, JSON.parse((body as Buffer).toString('utf8')))
      } catch (err) {
        done(err as Error, undefined)
      }
    },
  )

  fastify.get('/webhooks/whatsapp', verificarWebhookWhatsAppHandler)
  fastify.post('/webhooks/whatsapp', webhookWhatsAppHandler)

  // Lado da agência (autenticado): disparar e consultar solicitações
  fastify.post('/whatsapp/envios', {
    preHandler: [authenticate, validateBody(CreateWhatsAppEnvioSchema)],
  }, criarEnvioAprovacaoHandler)
  fastify.get('/whatsapp/envios', { preHandler: [authenticate] }, listarEnviosHandler)
}
