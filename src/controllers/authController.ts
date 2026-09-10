import { FastifyRequest, FastifyReply } from 'fastify'
import { PasswordResetService } from '../services/passwordResetService.js'
import { verifyEmail, resendVerificationEmail } from '../services/emailVerificationService.js'
import { UsuarioService } from '../services/usuarioService.js'
import { TwoFactorService } from '../services/twoFactorService.js'
import {
  definirCookiesDeSessao,
  limparCookiesDeSessao,
  lerRefreshTokenDaRequisicao,
  lerTokenDaRequisicao,
} from '../utils/authCookies.js'
import { erroInterno } from '../utils/erroInterno.js'

const passwordResetService = new PasswordResetService()
const usuarioService = new UsuarioService()
const twoFactorService = new TwoFactorService()

export async function forgotPassword(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const { email } = request.body as { email: string }

    // Fire-and-forget: never reveal whether the email is registered
    passwordResetService.requestReset(email).catch((erro) => {
      request.log.error({ erro }, 'Falha ao enviar email de recuperação de senha')
    })

    reply.send({
      message: 'Se o email estiver cadastrado, você receberá um link em breve.',
      success: true,
    })
  } catch (erro) {
    // A resposta é sempre a mesma para não revelar se o email existe; o log
    // fica só no servidor.
    request.log.error({ erro }, 'Falha ao processar pedido de recuperação de senha')
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
    erroInterno(request, reply, error, 'Erro ao redefinir senha')
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
    erroInterno(request, reply, error, 'Erro ao verificar e-mail')
  }
}

export async function resendVerification(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { email } = request.body as { email: string }
  resendVerificationEmail(email).catch(() => {})
  reply.send({ message: 'Se o e-mail estiver pendente de verificação, você receberá um novo link.', success: true })
}

export async function refreshTokenHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    // Navegador manda pelo cookie; script ou integração pode mandar no corpo.
    const refreshToken = lerRefreshTokenDaRequisicao(request)
    if (!refreshToken) {
      reply.status(400).send({ message: 'Refresh token é obrigatório', success: false })
      return
    }
    const { token, refreshToken: novoRefresh, expiresAt, refreshExpiresAt, usuario } =
      await usuarioService.refresh(refreshToken)

    definirCookiesDeSessao(reply, { token, refreshToken: novoRefresh }, { expiresAt, refreshExpiresAt })

    // Sem token no corpo: um XSS que chamasse /auth/refresh levaria embora um
    // par de tokens de longa duração, anulando o ganho do HttpOnly.
    reply.send({ data: { usuario }, success: true })
  } catch (error: any) {
    // Refresh que falhou é sessão morta — deixar o cookie no navegador só
    // produziria 401 em toda requisição seguinte.
    limparCookiesDeSessao(reply)
    reply.status(401).send({ message: error.message ?? 'Token inválido ou expirado', success: false })
  }
}

export async function logoutHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const credencial = lerTokenDaRequisicao(request)
    if (credencial) {
      await usuarioService.logout(credencial.token)
    }
  } catch (erro) {
    // Sempre responde sucesso — a limpeza do lado do cliente acontece de todo
    // jeito. Mas uma sessão que não morre no servidor é problema, e sem log
    // isso passava batido.
    request.log.error({ erro }, 'Falha ao revogar sessão no logout')
  }
  limparCookiesDeSessao(reply)
  reply.send({ message: 'Logout realizado com sucesso', success: true })
}

export async function twoFactorLoginHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const { userId, code } = request.body as { userId: string; code: string }

    const verified = await twoFactorService.verifyTwoFactorCode(userId, code)
    if (!verified.valid) {
      reply.status(400).send({ message: 'Código 2FA inválido', success: false })
      return
    }

    const { token, refreshToken, expiresAt, refreshExpiresAt, usuario } =
      await usuarioService.completeTwoFactorLogin(userId)

    definirCookiesDeSessao(reply, { token, refreshToken }, { expiresAt, refreshExpiresAt })
    reply.send({ data: { usuario }, success: true })
  } catch (error: any) {
    reply.status(400).send({ message: error.message ?? 'Erro na verificação 2FA', success: false })
  }
}
