import { randomBytes } from 'crypto'
import bcrypt from 'bcryptjs'
import prisma from '../database/client.js'
import { env } from '../config/env.js'
import { Resend } from 'resend'

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000 // 1 hour

function getResend(): Resend | null {
  if (!env.RESEND_API_KEY) return null
  return new Resend(env.RESEND_API_KEY)
}

export class PasswordResetService {
  async requestReset(email: string): Promise<void> {
    const usuario = await prisma.usuario.findUnique({
      where: { email },
      select: { id: true, nome: true, ativo: true, senha: true },
    })

    // Always respond the same way — don't reveal if email is registered
    if (!usuario || !usuario.ativo || !usuario.senha) return

    const rawToken = randomBytes(32).toString('hex')
    const hashedToken = await bcrypt.hash(rawToken, 10)
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS)

    await prisma.usuario.update({
      where: { id: usuario.id },
      data: {
        passwordResetToken: hashedToken,
        passwordResetExpiresAt: expiresAt,
      },
    })

    const resetUrl = `${env.FRONTEND_URL}/reset?token=${rawToken}`

    const resend = getResend()
    if (!resend) {
      // Dev fallback: log the link so developers can test without a real API key
      console.log(`[DEV] Password reset link for ${email}: ${resetUrl}`)
      return
    }

    await resend.emails.send({
      from: env.EMAIL_FROM,
      to: email,
      subject: 'Redefinição de senha — VIU',
      html: buildResetEmailHtml(usuario.nome, resetUrl),
    })
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    // Find all users with a non-expired reset token and check bcrypt match
    const candidates = await prisma.usuario.findMany({
      where: {
        passwordResetToken: { not: null },
        passwordResetExpiresAt: { gt: new Date() },
      },
      select: { id: true, passwordResetToken: true },
    })

    let matchedId: string | null = null
    for (const candidate of candidates) {
      if (!candidate.passwordResetToken) continue
      const match = await bcrypt.compare(rawToken, candidate.passwordResetToken)
      if (match) {
        matchedId = candidate.id
        break
      }
    }

    if (!matchedId) {
      throw new Error('Token inválido ou expirado')
    }

    const newHash = await bcrypt.hash(newPassword, 10)

    await prisma.usuario.update({
      where: { id: matchedId },
      data: {
        senha: newHash,
        passwordResetToken: null,
        passwordResetExpiresAt: null,
        // Invalidate all active sessions so attacker can't keep old sessions
      },
    })

    // Revoke all active sessions for this user
    await prisma.sessao.updateMany({
      where: { usuarioId: matchedId, ativo: true },
      data: { ativo: false },
    })
  }
}

function buildResetEmailHtml(nome: string, resetUrl: string): string {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:sans-serif;background:#f9f9f9;margin:0;padding:40px 0">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:8px;padding:40px;box-shadow:0 2px 8px rgba(0,0,0,.08)">
    <h2 style="margin-top:0;color:#111">Redefinição de senha</h2>
    <p>Olá, <strong>${nome}</strong>.</p>
    <p>Recebemos uma solicitação para redefinir a senha da sua conta VIU. Clique no botão abaixo para criar uma nova senha:</p>
    <p style="text-align:center;margin:32px 0">
      <a href="${resetUrl}" style="background:#000;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">
        Redefinir senha
      </a>
    </p>
    <p style="font-size:13px;color:#666">
      Este link expira em <strong>1 hora</strong>. Se você não solicitou a redefinição, ignore este email — sua senha permanece a mesma.
    </p>
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
    <p style="font-size:12px;color:#999;margin:0">VIU — Plataforma de colaboração criativa</p>
  </div>
</body>
</html>`
}
