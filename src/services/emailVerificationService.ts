import crypto from 'crypto'
import { Resend } from 'resend'
import { prisma } from '../database/client.js'
import { env } from '../config/env.js'

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex')
}

export async function sendVerificationEmail(usuarioId: string, email: string): Promise<void> {
  const rawToken = crypto.randomBytes(32).toString('hex')
  const hashed = hashToken(rawToken)
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24h

  await prisma.usuario.update({
    where: { id: usuarioId },
    data: { emailVerificacaoToken: hashed, emailVerificacaoExpiresAt: expiresAt },
  })

  const link = `${env.FRONTEND_URL}/verificar-email?token=${rawToken}`

  if (!resend) {
    console.info(`[EMAIL VERIFICATION] Link para ${email}: ${link}`)
    return
  }

  await resend.emails.send({
    from: env.EMAIL_FROM,
    to: email,
    subject: 'Confirme seu e-mail — VIU',
    html: `
      <p>Olá,</p>
      <p>Confirme seu endereço de e-mail clicando no link abaixo. O link é válido por 24 horas.</p>
      <p><a href="${link}">Confirmar e-mail</a></p>
      <p>Se você não criou uma conta no VIU, ignore este e-mail.</p>
    `,
  })
}

export async function verifyEmail(rawToken: string): Promise<void> {
  const hashed = hashToken(rawToken)

  const usuario = await prisma.usuario.findFirst({
    where: {
      emailVerificacaoToken: hashed,
      emailVerificacaoExpiresAt: { gt: new Date() },
    },
    select: { id: true, emailVerificado: true },
  })

  if (!usuario) {
    throw new Error('Token inválido ou expirado')
  }

  if (usuario.emailVerificado) {
    return // idempotente — já verificado
  }

  await prisma.usuario.update({
    where: { id: usuario.id },
    data: {
      emailVerificado: true,
      emailVerificacaoToken: null,
      emailVerificacaoExpiresAt: null,
    },
  })
}

export async function resendVerificationEmail(email: string): Promise<void> {
  const usuario = await prisma.usuario.findUnique({
    where: { email },
    select: { id: true, emailVerificado: true },
  })

  // Sempre retorna sem revelar se o email existe
  if (!usuario || usuario.emailVerificado) return

  await sendVerificationEmail(usuario.id, email)
}
