// src/index.ts
/**
 * Ponto de entrada da aplicação Fastify
 *
 * Este arquivo instância o servidor Fastify, registra as rotas de projetos
 * e inicia a escuta em uma porta configurada. Manter a criação do servidor
 * separada permite maior flexibilidade para testes automatizados.
 */

import fastify from 'fastify'
import { fileURLToPath } from 'url'
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
import { setupErrorHandler } from './middleware/errorHandlerMiddleware.js'
import { auditLogMiddleware } from './middleware/auditLogMiddleware.js'

const __filename = fileURLToPath(import.meta.url)

export async function buildServer() {
  // Configuração do Fastify com limites de segurança
  const app = fastify({
    logger: true,
    // Limite global de tamanho do body (10MB para requisições normais)
    // Requisições multipart têm seu próprio limite configurado abaixo
    bodyLimit: 10 * 1024 * 1024, // 10MB
    // Limite de tamanho dos cabeçalhos
    maxParamLength: 500,
  })

  // Configuração de error handler global (sanitiza erros em produção)
  setupErrorHandler(app)

// Configuração segura de CORS - apenas origens específicas
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : ['http://localhost:3000', 'http://localhost:5173']

  await app.register(import('@fastify/cors'), {
    origin: (origin, callback) => {
      // Permite requisições sem origin (como Postman, curl, etc) apenas em desenvolvimento
      if (!origin && process.env.NODE_ENV === 'development') {
        callback(null, true)
        return
      }

      // Verifica se a origem está na lista de permitidas
      if (origin && allowedOrigins.includes(origin)) {
        callback(null, true)
        return
      }

      // Bloqueia origens não autorizadas
      callback(new Error('Origem não autorizada pelo CORS'), false)
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })

  await app.register(import('@fastify/multipart'), {
    limits: {
      fileSize: 25 * 1024 * 1024, // 25MB max para áudio
    },
  })

  // Configuração de Rate Limiting - proteção contra brute force e abuse
  await app.register(import('@fastify/rate-limit'), {
    global: true,
    max: 100, // máximo de requisições
    timeWindow: '15 minutes', // janela de tempo
    errorResponseBuilder: (request, context) => {
      return {
        statusCode: 429,
        error: 'Too Many Requests',
        message: `Você atingiu o limite de ${context.max} requisições por ${context.after}. Tente novamente mais tarde.`,
        success: false,
      }
    },
  })

  // Helmet - Adiciona headers de segurança HTTP
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
    crossOriginEmbedderPolicy: false, // Permite embedding se necessário
  })

  // Middleware global de audit logging (registra ações importantes)
  app.addHook('preHandler', auditLogMiddleware)

  // Health check route
  app.get('/', async (request, reply) => {
    return {
      status: 'ok',
      message: 'VIU Backend API rodando!',
      timestamp: new Date().toISOString()
    }
  })

  // Registrar rotas de projetos
  await app.register(projetosRoutes)
  // Registrar rotas de usuários
  await app.register(usuariosRoutes)
  // Registrar rotas de artes
  await app.register(artesRoutes)
  // Registrar rotas de feedbacks
  await app.register(feedbacksRoutes)
  // Registrar rotas de aprovações
  await app.register(aprovacoesRoutes)
  // Registrar rotas de tarefas
  await app.register(tarefasRoutes)
  // Registrar rotas de notificações
  await app.register(notificacoesRoutes)
  // Registrar rotas de sessões
  await app.register(sessoesRoutes)
  // Registrar rotas de 2FA
  await app.register(twoFactorRoutes)
  // Registrar rotas de segurança (audit logs e monitoring)
  await app.register(securityRoutes)
  // Registrar rotas de links compartilhados
  await app.register(linksRoutes)
  return app
}

// Apenas inicia o servidor se este módulo for executado diretamente
if (process.argv[1] === __filename) {
  buildServer()
    .then((app) => {
      const port = process.env.PORT ? Number(process.env.PORT) : 3001
      app.listen({ port }, (err, address) => {
        if (err) {
          app.log.error(err)
          process.exit(1)
        }
        app.log.info(`Servidor iniciado em ${address}`)
      })
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error(err)
    })
}