import { FastifyInstance, FastifyRequest } from 'fastify'
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
import { COOKIE_REFRESH } from '../utils/authCookies.js'
import { criarJanelaDeslizante } from '../utils/limiteEmMemoria.js'

/*
 * Teto do /auth/refresh por IP, que cookie nenhum contorna.
 *
 * A cota da rota é chaveada pelo refresh token para que a renovação de uma
 * pessoa não derrube a de outra. Só que essa chave vem de um COOKIE, que quem
 * chama escolhe: mandando um valor diferente a cada requisição, ganha-se um
 * balde novo toda vez e a rota fica sem teto algum — e cada tentativa ainda
 * consulta o banco antes de ser recusada.
 *
 * O limitador global tem a mesma brecha, e de propósito: o comentário dele diz
 * que "abuso é barrado pelos limites por rota". Ou seja, era este limite que
 * segurava — e chavear só pelo token o teria removido.
 *
 * Os dois convivem. O balde por token é apertado (20) e cuida da justiça entre
 * pessoas; este teto é largo e cuida do abuso. Largo de propósito: uma pessoa
 * renova a cada sete dias, então 120 em 15 minutos não encosta em uso real nem
 * quando um proxy junta todo mundo no mesmo endereço. E quando encosta, o 429
 * daqui chega ao cliente como "não deu para confirmar", que não desloga
 * ninguém — ao contrário do 401.
 */
const JANELA_REFRESH_MS = 15 * 60 * 1000
const TETO_REFRESH_POR_IP = 120
const janelaRefreshPorIp = criarJanelaDeslizante(JANELA_REFRESH_MS)

/** Exposto para os testes poderem começar sem histórico. */
export function limparTetoDeRefresh(): void {
  janelaRefreshPorIp.limpar()
}
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
    config: {
      rateLimit: {
        max: 20,
        timeWindow: '15 minutes',
        /*
         * Chaveado pelo refresh token, e não pelo IP.
         *
         * O `keyGenerator` global chaveia pelo cookie do token de acesso — que
         * nesta rota, por definição, já venceu e não é mais enviado pelo
         * navegador. A chave caía no IP, e atrás do proxy do Railway o IP é o
         * mesmo para todo mundo: eram 20 renovações por 15 minutos para a
         * plataforma inteira, com uma pessoa renovando derrubando as outras.
         * Medido antes da correção: o contador caiu de 19 a 14 alternando
         * entre duas contas diferentes.
         *
         * Como o token rotaciona a cada renovação bem-sucedida, a cota não
         * atrapalha quem está renovando de verdade — ela continua apertada
         * onde precisa estar, que é em cima de um mesmo token tentado à força.
         */
        keyGenerator: (request: FastifyRequest) => {
          const refresh = (request as { cookies?: Record<string, string> }).cookies?.[
            COOKIE_REFRESH
          ]
          return refresh ? `refresh:${refresh}` : `ip:${request.ip}`
        },
      },
    },
    preHandler: async (request, reply) => {
      if (janelaRefreshPorIp.registrar(`refresh:${request.ip}`) > TETO_REFRESH_POR_IP) {
        reply
          .status(429)
          .send({ message: 'Muitas tentativas. Espere um pouco e tente de novo.', success: false })
      }
    },
  }, refreshTokenHandler)

  fastify.post('/auth/logout', {}, logoutHandler)

  fastify.post('/auth/2fa/login', {
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
    preHandler: [validateBody(TwoFactorLoginSchema)],
  }, twoFactorLoginHandler)
}
