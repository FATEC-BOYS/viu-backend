/**
 * 🧪 Rotas de Teste - VIU Shared Integration
 *
 * TEMPORARILY DISABLED - Requires viu-shared package setup
 */

import { FastifyInstance } from 'fastify'

export async function testRoutes(fastify: FastifyInstance) {
  // All test routes temporarily disabled - requires viu-shared setup
  fastify.all('/test/*', async (request, reply) => {
    return reply.status(503).send({
      message: 'Test routes temporarily unavailable - viu-shared package not configured',
      success: false,
    })
  })
}
