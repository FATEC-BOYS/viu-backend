import { FastifyRequest, FastifyReply } from 'fastify'
import { PasswordResetService } from '../services/passwordResetService.js'

const passwordResetService = new PasswordResetService()

export async function forgotPassword(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const { email } = request.body as { email: string }

    // Fire-and-forget: never reveal whether the email is registered
    passwordResetService.requestReset(email).catch(() => {
      // Swallow errors silently — same response regardless
    })

    reply.send({
      message: 'Se o email estiver cadastrado, você receberá um link em breve.',
      success: true,
    })
  } catch {
    // Same message on error to prevent timing attacks
    reply.send({
      message: 'Se o email estiver cadastrado, você receberá um link em breve.',
      success: true,
    })
  }
}

export async function resetPassword(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const { token, password } = request.body as { token: string; password: string }

    await passwordResetService.resetPassword(token, password)

    reply.send({
      message: 'Senha redefinida com sucesso. Faça login com sua nova senha.',
      success: true,
    })
  } catch (error: any) {
    if (error.message.includes('inválido') || error.message.includes('expirado')) {
      reply.status(400).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({ message: 'Erro ao redefinir senha', success: false })
  }
}
