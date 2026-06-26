import { TOTP, verify as totpVerify } from 'otplib'
import * as QRCode from 'qrcode'
import { randomBytes } from 'crypto'
import bcrypt from 'bcryptjs'
import prisma from '../database/client.js'

const authenticator = new TOTP()

export class TwoFactorService {
  private readonly APP_NAME = 'VIU Platform'

  async generateTwoFactorSecret(userId: string) {
    const usuario = await prisma.usuario.findUnique({
      where: { id: userId },
      select: { id: true, email: true, twoFactorEnabled: true },
    })

    if (!usuario) throw new Error('Usuário não encontrado')
    if (usuario.twoFactorEnabled) {
      throw new Error('2FA já está habilitado. Desabilite primeiro para reconfigurar.')
    }

    const secret = authenticator.generateSecret()
    const otpauthUrl = `otpauth://totp/${encodeURIComponent(this.APP_NAME)}:${encodeURIComponent(usuario.email)}?secret=${secret}&issuer=${encodeURIComponent(this.APP_NAME)}`
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl)

    const backupCodes = this.generateBackupCodes(10)
    const hashedBackupCodes = await Promise.all(backupCodes.map((c) => bcrypt.hash(c, 10)))

    // Store secret server-side (plaintext required for TOTP verification)
    // and pre-hash backup codes; twoFactorEnabled stays false until /2fa/enable
    await prisma.usuario.update({
      where: { id: userId },
      data: {
        twoFactorSecret: secret,
        twoFactorBackupCodes: hashedBackupCodes,
      },
    })

    return {
      qrCode: qrCodeDataUrl,
      manualEntryKey: secret,
      backupCodes, // shown once to user — not returned again
    }
  }

  async enableTwoFactor(userId: string, code: string) {
    const usuario = await prisma.usuario.findUnique({
      where: { id: userId },
      select: { twoFactorSecret: true, twoFactorEnabled: true },
    })

    if (!usuario) throw new Error('Usuário não encontrado')
    if (usuario.twoFactorEnabled) throw new Error('2FA já está habilitado')
    if (!usuario.twoFactorSecret) throw new Error('Configure o 2FA primeiro via /2fa/setup')

    // Secret comes from server-side storage, NOT from the client
    const isValid = totpVerify({ token: code, secret: usuario.twoFactorSecret })
    if (!isValid) throw new Error('Código 2FA inválido. Verifique e tente novamente.')

    await prisma.usuario.update({
      where: { id: userId },
      data: { twoFactorEnabled: true },
    })

    return { success: true, message: '2FA habilitado com sucesso' }
  }

  async disableTwoFactor(userId: string, password: string) {
    const usuario = await prisma.usuario.findUnique({
      where: { id: userId },
      select: { senha: true, twoFactorEnabled: true },
    })

    if (!usuario) throw new Error('Usuário não encontrado')
    if (!usuario.twoFactorEnabled) throw new Error('2FA não está habilitado')
    if (!usuario.senha) {
      throw new Error('Usuário não possui senha configurada.')
    }

    const senhaValida = await bcrypt.compare(password, usuario.senha)
    if (!senhaValida) throw new Error('Senha incorreta')

    await prisma.usuario.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorBackupCodes: [],
      },
    })

    return { success: true, message: '2FA desabilitado com sucesso' }
  }

  async verifyTwoFactorCode(
    userId: string,
    code: string,
  ): Promise<{ valid: boolean; usedBackupCode: boolean }> {
    const usuario = await prisma.usuario.findUnique({
      where: { id: userId },
      select: {
        twoFactorSecret: true,
        twoFactorBackupCodes: true,
        twoFactorEnabled: true,
      },
    })

    if (!usuario || !usuario.twoFactorEnabled || !usuario.twoFactorSecret) {
      throw new Error('2FA não está configurado para este usuário')
    }

    // Verify as TOTP first
    const isTotpValid = await Promise.resolve(totpVerify({ token: code, secret: usuario.twoFactorSecret }))
    if (isTotpValid) {
      return { valid: true, usedBackupCode: false }
    }

    // Fall back to backup codes
    for (let i = 0; i < usuario.twoFactorBackupCodes.length; i++) {
      const hashedCode = usuario.twoFactorBackupCodes[i]
      if (!hashedCode) continue
      const isBackupValid = await bcrypt.compare(code, hashedCode)
      if (isBackupValid) {
        const updatedBackupCodes = usuario.twoFactorBackupCodes.filter((_: string, idx: number) => idx !== i)
        await prisma.usuario.update({
          where: { id: userId },
          data: { twoFactorBackupCodes: updatedBackupCodes },
        })
        return { valid: true, usedBackupCode: true }
      }
    }

    return { valid: false, usedBackupCode: false }
  }

  async regenerateBackupCodes(userId: string, password: string) {
    const usuario = await prisma.usuario.findUnique({
      where: { id: userId },
      select: { senha: true, twoFactorEnabled: true },
    })

    if (!usuario) throw new Error('Usuário não encontrado')
    if (!usuario.twoFactorEnabled) throw new Error('2FA não está habilitado')
    if (!usuario.senha) {
      throw new Error('Usuário não possui senha configurada.')
    }

    const senhaValida = await bcrypt.compare(password, usuario.senha)
    if (!senhaValida) throw new Error('Senha incorreta')

    const backupCodes = this.generateBackupCodes(10)
    const hashedBackupCodes = await Promise.all(backupCodes.map((c) => bcrypt.hash(c, 10)))

    await prisma.usuario.update({
      where: { id: userId },
      data: { twoFactorBackupCodes: hashedBackupCodes },
    })

    return {
      success: true,
      backupCodes,
      message: 'Códigos de backup regenerados. Salve-os em um local seguro!',
    }
  }

  async isTwoFactorEnabled(userId: string): Promise<boolean> {
    const usuario = await prisma.usuario.findUnique({
      where: { id: userId },
      select: { twoFactorEnabled: true },
    })
    return usuario?.twoFactorEnabled ?? false
  }

  private generateBackupCodes(count: number): string[] {
    const codes: string[] = []
    for (let i = 0; i < count; i++) {
      const code = randomBytes(4)
        .toString('hex')
        .toUpperCase()
        .match(/.{1,4}/g)
        ?.join('-')
      if (code) codes.push(code)
    }
    return codes
  }

  async getTwoFactorStats() {
    const [total, enabled, disabled] = await Promise.all([
      prisma.usuario.count(),
      prisma.usuario.count({ where: { twoFactorEnabled: true } }),
      prisma.usuario.count({ where: { twoFactorEnabled: false } }),
    ])
    return {
      total,
      enabled,
      disabled,
      enabledPercentage: total > 0 ? ((enabled / total) * 100).toFixed(2) : '0',
    }
  }
}

export const twoFactorService = new TwoFactorService()
