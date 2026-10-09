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
  TwoFactorLoginSchema,
} from '../schemas/validation.js'

export async function authRoutes(fastify: FastifyInstance) {
  /*
   * Corpo vazio com `Content-Type: application/json` não pode virar 400 aqui.
   *
   * O parser padrão do Fastify recusa a combinação — "Body cannot be empty
   * when content-type is set to 'application/json'" — e recusa ANTES de a rota
   * rodar. Como `/auth/refresh` existe para ser chamada sem corpo (o refresh
   * token vem do cookie), qualquer cliente que mande o header de JSON por
   * hábito perdia a renovação, e com ela a sessão. Era exatamente isso que
   * deslogava quem estava logado: o navegador pedia para renovar, levava 400,
   * e o cliente HTTP concluía que a sessão tinha acabado.
   *
   * O parser vale só neste escopo — este é um plugin comum, não
   * `fastify-plugin` —, então o resto da API segue com o comportamento padrão.
   * Nas rotas daqui que exigem campos, o corpo vazio passa a cair na validação
   * do zod, que diz qual campo falta em vez de falar de content-type.
   */
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_request, corpo, done) => {
      const texto = (corpo as string).trim()
      if (texto === '') {
        done(null, {})
        return
      }
      try {
        done(null, JSON.parse(texto))
      } catch {
        const erro = new Error('Corpo da requisição não é um JSON válido') as Error & {
          statusCode?: number
        }
        erro.statusCode = 400
        done(erro, undefined)
      }
    },
  )

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

  // Sem validateBody: com sessão por cookie o corpo vem vazio, e o refresh
  // token é lido do cookie. O handler valida a presença de um ou de outro.
  fastify.post('/auth/refresh', {
    config: { rateLimit: { max: 20, timeWindow: '15 minutes' } },
  }, refreshTokenHandler)

  fastify.post('/auth/logout', {}, logoutHandler)

  fastify.post('/auth/2fa/login', {
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
    preHandler: [validateBody(TwoFactorLoginSchema)],
  }, twoFactorLoginHandler)
}
