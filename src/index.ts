import 'dotenv/config'
import './config/env.js'

import fastify from 'fastify'
import { fileURLToPath } from 'url'
import { randomUUID } from 'crypto'
import { projetosRoutes } from './routes/projetos.js'
import { usuariosRoutes } from './routes/usuarios.js'
import { artesRoutes } from './routes/artes.js'
import { feedbacksRoutes } from './routes/feedbacks.js'
import { aprovacoesRoutes } from './routes/aprovacoes.js'
import { tarefasRoutes } from './routes/tarefas.js'
import { notificacoesRoutes } from './routes/notificacoes.js'
import { sessoesRoutes } from './routes/sessoes.js'
import { twoFactorRoutes } from './routes/twoFactor.js'
import { securityRoutes } from './routes/security.js'
import { linksRoutes } from './routes/links.js'
import { authRoutes } from './routes/auth.js'
import { planosRoutes } from './routes/planos.js'
import { assinaturasRoutes } from './routes/assinaturas.js'
import { faturasRoutes } from './routes/faturas.js'
import { pagamentosRoutes } from './routes/pagamentos.js'
import { saquesRoutes } from './routes/saques.js'
import { aceitesRoutes } from './routes/aceites.js'
import { disputasRoutes } from './routes/disputas.js'
import { equipesRoutes } from './routes/equipes.js'
import { convitesRoutes } from './routes/convites.js'
import { equipeConvitesRoutes } from './routes/equipeConvites.js'
import { setupErrorHandler } from './middleware/errorHandlerMiddleware.js'
import { auditLogMiddleware } from './middleware/auditLogMiddleware.js'
import { auditLogService } from './services/auditLogService.js'
import { env } from './config/env.js'

const __filename = fileURLToPath(import.meta.url)

// BigInt não serializa para JSON nativamente; converte para Number (seguro até ~9 PB)
;(BigInt.prototype as any).toJSON = function () { return Number(this) }

export async function buildServer() {
  const app = fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      serializers: {
        req(request) {
          return {
            method: request.method,
            url: request.url,
            hostname: request.hostname,
            remoteAddress: request.ip,
            requestId: request.id,
          }
        },
        res(reply) {
          return { statusCode: reply.statusCode }
        },
      },
    },
    genReqId: () => randomUUID(),
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId',
    bodyLimit: 10 * 1024 * 1024,
    maxParamLength: 500,
  })

  setupErrorHandler(app)

  const allowedOrigins = env.ALLOWED_ORIGINS.split(',')

  await app.register(import('@fastify/cors'), {
    origin: (origin, callback) => {
      // Always reject requests without Origin header — prevents CSRF from non-browser clients
      if (!origin) {
        callback(new Error('Origin header ausente'), false)
        return
      }
      if (allowedOrigins.includes(origin)) {
        callback(null, true)
        return
      }
      callback(new Error('Origem não autorizada pelo CORS'), false)
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })

  await app.register(import('@fastify/multipart'), {
    limits: { fileSize: 25 * 1024 * 1024 },
  })

  await app.register(import('@fastify/rate-limit'), {
    global: true,
    max: 100,
    timeWindow: '15 minutes',
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: `Limite de ${context.max} requisições por ${context.after} atingido.`,
      success: false,
    }),
  })

  await app.register(import('@fastify/helmet'), {
    global: true,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
    crossOriginEmbedderPolicy: false,
  })

  // Propagate request ID back to clients for log correlation
  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id)
  })

  app.addHook('preHandler', auditLogMiddleware)

  // Persist audit log after each response so we capture the final status code
  app.addHook('onResponse', async (request, reply) => {
    const auditData = (request as any).auditLog
    if (!auditData) return
    try {
      await auditLogService.log({
        ...auditData,
        status: reply.statusCode < 400 ? 'SUCCESS' : 'FAILURE',
      })
    } catch {
      // Never let audit log failure affect the response
    }
  })

  app.get('/', async () => ({
    status: 'ok',
    message: 'VIU Backend API',
    timestamp: new Date().toISOString(),
  }))

  await app.register(projetosRoutes)
  await app.register(usuariosRoutes)
  await app.register(artesRoutes)
  await app.register(feedbacksRoutes)
  await app.register(aprovacoesRoutes)
  await app.register(tarefasRoutes)
  await app.register(notificacoesRoutes)
  await app.register(sessoesRoutes)
  await app.register(twoFactorRoutes)
  await app.register(securityRoutes)
  await app.register(linksRoutes)
  await app.register(authRoutes)
  await app.register(planosRoutes)
  await app.register(assinaturasRoutes)
  await app.register(faturasRoutes)
  await app.register(pagamentosRoutes)
  await app.register(saquesRoutes)
  await app.register(aceitesRoutes)
  await app.register(disputasRoutes)
  await app.register(equipesRoutes)
  await app.register(convitesRoutes)
  await app.register(equipeConvitesRoutes)

  return app
}

if (process.argv[1] === __filename) {
  buildServer()
    .then((app) => {
      const port = env.PORT ? Number(env.PORT) : 3001
      const host = env.HOST || '0.0.0.0'
      app.listen({ port, host }, (err, address) => {
        if (err) {
          app.log.error(err)
          process.exit(1)
        }
        app.log.info(`Servidor iniciado em ${address}`)
      })
    })
    .catch(console.error)
}
