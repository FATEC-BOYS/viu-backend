import { FastifyRequest, FastifyReply } from 'fastify'
import { verificarCaptcha } from '../services/captchaService.js'

/**
 * Roda **antes** do `validateCreateUsuario`.
 *
 * O schema do cadastro usa `z.object`, que descarta campo desconhecido, e o
 * service faz `prisma.create({ data: { ...userData } })`. Se o `captchaToken`
 * entrasse no schema para sobreviver à validação, ele chegaria ao Prisma como
 * coluna inexistente. Lendo o corpo cru aqui, o token é usado e depois some
 * naturalmente na validação — sem campo novo no banco nem no tipo.
 */
export async function verificarCaptchaDoCadastro(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const corpo = (request.body ?? {}) as { captchaToken?: string }
  const resultado = await verificarCaptcha(corpo.captchaToken, request.ip)

  if (!resultado.valido) {
    request.log.warn({ motivo: resultado.motivo }, 'Cadastro recusado pelo captcha')
    reply.status(400).send({
      message: 'Não foi possível confirmar que você não é um robô. Recarregue a página e tente de novo.',
      success: false,
    })
  }
}
