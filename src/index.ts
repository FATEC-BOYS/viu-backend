/**
 * 🚀 VIU Backend - Servidor Principal
 * 
 * API Node.js com Fastify + TypeScript para a plataforma VIU
 */

import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'

// Configurações
const PORT = Number(process.env.PORT) || 3001
const HOST = process.env.HOST || '0.0.0.0'
const NODE_ENV = process.env.NODE_ENV || 'development'

// Criar instância do Fastify
const fastify = Fastify({
  logger: NODE_ENV === 'development' ? {
    level: 'info',
    transport: {
      target: 'pino-pretty'
    }
  } : {
    level: 'info'
  }
})

/**
 * 🔧 Configuração de Middlewares
 */
async function setupMiddlewares() {
  // CORS - Permitir requisições do frontend/mobile
  await fastify.register(cors, {
    origin: true, // Permitir qualquer origem em desenvolvimento
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']
  })

  // Helmet - Segurança básica
  await fastify.register(helmet, {
    contentSecurityPolicy: false // Desabilitar para desenvolvimento
  })

  // Rate Limiting - Proteção contra spam
  await fastify.register(rateLimit, {
    max: 100, // 100 requests
    timeWindow: '1 minute' // por minuto
  })
}

/**
 * 🛣️ Configuração de Rotas
 */
async function setupRoutes() {
  // Rota de health check
  fastify.get('/health', async (request, reply) => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: NODE_ENV,
      version: '1.0.0'
    }
  })

  // Rota de informações da API
  fastify.get('/', async (request, reply) => {
    return {
      name: 'VIU Backend API',
      version: '1.0.0',
      description: 'API da plataforma VIU para designers e clientes',
      environment: NODE_ENV,
      docs: '/docs',
      health: '/health',
      tests: {
        currency: '/test/currency',
        phone: '/test/phone',
        date: '/test/date',
        cpf: '/test/cpf',
        email: '/test/email',
        cnpj: '/test/cnpj',
        enums: '/test/enums',
        fileSize: '/test/file-size',
        all: '/test/all',
        validateUser: 'POST /test/validate-user',
        validateLogin: 'POST /test/validate-login'
      }
    }
  })

  // 🧪 Registrar rotas de teste do viu-shared
  const { testRoutes } = await import('./routes/test.js')
  await fastify.register(testRoutes)
}

/**
 * 🚀 Inicialização do Servidor
 */
async function start() {
  try {
    // Configurar middlewares
    await setupMiddlewares()
    
    // Configurar rotas
    await setupRoutes()
    
    // Iniciar servidor
    await fastify.listen({ 
      port: PORT, 
      host: HOST 
    })
    
    console.log(`
🚀 VIU Backend iniciado com sucesso!

📍 Servidor: http://${HOST}:${PORT}
🌍 Ambiente: ${NODE_ENV}
📊 Health: http://${HOST}:${PORT}/health
🧪 Teste: http://${HOST}:${PORT}/test

✨ Pronto para integrar com viu-shared!
    `)
    
  } catch (error) {
    fastify.log.error(error)
    console.error('❌ Erro ao iniciar servidor:', error)
    process.exit(1)
  }
}

/**
 * 🛑 Graceful Shutdown
 */
process.on('SIGINT', async () => {
  console.log('\n🛑 Recebido SIGINT, encerrando servidor...')
  try {
    await fastify.close()
    console.log('✅ Servidor encerrado com sucesso')
    process.exit(0)
  } catch (error) {
    console.error('❌ Erro ao encerrar servidor:', error)
    process.exit(1)
  }
})

// Iniciar aplicação
start()

