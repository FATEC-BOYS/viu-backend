import { FastifyRequest, FastifyReply } from 'fastify'
import { PasswordResetService } from '../services/passwordResetService.js'
import { verifyEmail, resendVerificationEmail } from '../services/emailVerificationService.js'
import { UsuarioService } from '../services/usuarioService.js'

const passwordResetService = new PasswordResetService()
const usuarioService = new UsuarioService()

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

export async function verifyEmailHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const { token } = request.query as { token?: string }
    if (!token || token.length !== 64) {
      reply.status(400).send({ message: 'Token inválido', success: false })
      return
    }
    await verifyEmail(token)
    reply.send({ message: 'E-mail verificado com sucesso.', success: true })
  } catch (error: any) {
    if (error.message.includes('inválido') || error.message.includes('expirado')) {
      reply.status(400).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({ message: 'Erro ao verificar e-mail', success: false })
  }
}

export async function resendVerification(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  // Fire-and-forget — always same response (anti-enumeration)
  const { email } = request.body as { email: string }
  resendVerificationEmail(email).catch(() => {})
  reply.send({ message: 'Se o e-mail estiver pendente de verificação, você receberá um novo link.', success: true })
}

export async function refreshTokenHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const { refreshToken } = request.body as { refreshToken?: string }
    if (!refreshToken) {
      reply.status(400).send({ message: 'Refresh token é obrigatório', success: false })
      return
    }
    const result = await usuarioService.refresh(refreshToken)
    reply.send({ data: result, success: true })
  } catch (error: any) {
    reply.status(401).send({ message: error.message ?? 'Token inválido ou expirado', success: false })
  }
}

export async function logoutHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const authHeader = request.headers.authorization
    if (authHeader?.startsWith('Bearer ')) {
      await usuarioService.logout(authHeader.slice(7))
    }
  } catch {
    // always return success — client-side cleanup happens regardless
  }
  reply.send({ message: 'Logout realizado com sucesso', success: true })
}
