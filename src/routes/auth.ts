import { FastifyInstance } from 'fastify'
import { forgotPassword, resetPassword } from '../controllers/authController.js'
import { validateBody } from '../middleware/validationMiddleware.js'
import {
  ForgotPasswordRequestSchema,
  ResetPasswordRequestSchema,
} from '../schemas/validation.js'

export async function authRoutes(fastify: FastifyInstance) {
  // Rate limit password reset routes aggressively
  fastify.post('/auth/forgot-password', {
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
    preHandler: [validateBody(ForgotPasswordRequestSchema)],
  }, forgotPassword)

  fastify.post('/auth/reset-password', {
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
    preHandler: [validateBody(ResetPasswordRequestSchema)],
  }, resetPassword)
}
