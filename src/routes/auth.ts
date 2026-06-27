import { FastifyInstance } from 'fastify'
import {
  forgotPassword,
  resetPassword,
  verifyEmailHandler,
  resendVerification,
  refreshTokenHandler,
  logoutHandler,
  twoFactorLoginHandler,
} from '../controllers/authController.js'
import { validateBody } from '../middleware/validationMiddleware.js'
import {
  ForgotPasswordRequestSchema,
  ResetPasswordRequestSchema,
  ResendVerificationSchema,
  RefreshTokenSchema,
  TwoFactorLoginSchema,
} from '../schemas/validation.js'

export async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/auth/forgot-password', {
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
    preHandler: [validateBody(ForgotPasswordRequestSchema)],
  }, forgotPassword)

  fastify.post('/auth/reset-password', {
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
    preHandler: [validateBody(ResetPasswordRequestSchema)],
  }, resetPassword)

  fastify.get('/auth/verify-email', {
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
  }, verifyEmailHandler)

  fastify.post('/auth/resend-verification', {
    config: { rateLimit: { max: 3, timeWindow: '15 minutes' } },
    preHandler: [validateBody(ResendVerificationSchema)],
  }, resendVerification)

  fastify.post('/auth/refresh', {
    config: { rateLimit: { max: 20, timeWindow: '15 minutes' } },
    preHandler: [validateBody(RefreshTokenSchema)],
  }, refreshTokenHandler)

  fastify.post('/auth/logout', {}, logoutHandler)

  fastify.post('/auth/2fa/login', {
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
    preHandler: [validateBody(TwoFactorLoginSchema)],
  }, twoFactorLoginHandler)
}
