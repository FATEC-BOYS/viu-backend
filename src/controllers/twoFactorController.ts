/**
 * Controller de Autenticação de Dois Fatores (2FA)
 */

import { FastifyRequest, FastifyReply } from 'fastify'
import { twoFactorService } from '../services/twoFactorService.js'
import { auditLogService } from '../services/auditLogService.js'

/**
 * POST /2fa/setup
 * Gera um novo secret 2FA e QR code para o usuário
 */
export async function setupTwoFactor(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario

    if (!usuario?.id) {
      reply.status(401).send({
        message: 'Usuário não autenticado',
        success: false,
      })
      return
    }

    const result = await twoFactorService.generateTwoFactorSecret(usuario.id)

    // Log da ação
    await auditLogService.logSuccess('ENABLE_2FA', 'Usuario', {
      usuarioId: usuario.id,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
      details: { step: 'setup_initiated' },
    })

    reply.status(200).send({
      message: 'QR Code gerado com sucesso. Escaneie com seu app autenticador.',
      data: {
        qrCode: result.qrCode,
        manualEntryKey: result.manualEntryKey,
        backupCodes: result.backupCodes,
      },
      // Retorna o secret temporário que será usado na verificação
      tempSecret: result.secret,
      success: true,
    })
  } catch (error: any) {
    await auditLogService.logFailure('ENABLE_2FA', 'Usuario', error.message, {
      usuarioId: (request as any).usuario?.id,
      ipAddress: request.ip,
    })

    reply.status(500).send({
      message: 'Erro ao configurar 2FA',
      error: error.message,
      success: false,
    })
  }
}

/**
 * POST /2fa/enable
 * Verifica o código e habilita 2FA
 */
export async function enableTwoFactor(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { code, secret, backupCodes } = request.body as {
      code: string
      secret: string
      backupCodes: string[]
    }

    if (!usuario?.id) {
      reply.status(401).send({
        message: 'Usuário não autenticado',
        success: false,
      })
      return
    }

    if (!code || !secret || !backupCodes) {
      reply.status(400).send({
        message: 'Código, secret e códigos de backup são obrigatórios',
        success: false,
      })
      return
    }

    const result = await twoFactorService.enableTwoFactor(
      usuario.id,
      secret,
      code,
      backupCodes,
    )

    await auditLogService.logSuccess('ENABLE_2FA', 'Usuario', {
      usuarioId: usuario.id,
      resourceId: usuario.id,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    })

    reply.status(200).send({
      message: result.message,
      success: true,
    })
  } catch (error: any) {
    await auditLogService.logFailure('ENABLE_2FA', 'Usuario', error.message, {
      usuarioId: (request as any).usuario?.id,
      ipAddress: request.ip,
    })

    reply.status(400).send({
      message: error.message,
      success: false,
    })
  }
}

/**
 * POST /2fa/disable
 * Desabilita 2FA
 */
export async function disableTwoFactor(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { password } = request.body as { password: string }

    if (!usuario?.id) {
      reply.status(401).send({
        message: 'Usuário não autenticado',
        success: false,
      })
      return
    }

    if (!password) {
      reply.status(400).send({
        message: 'Senha é obrigatória para desabilitar 2FA',
        success: false,
      })
      return
    }

    const result = await twoFactorService.disableTwoFactor(usuario.id, password)

    await auditLogService.logSuccess('DISABLE_2FA', 'Usuario', {
      usuarioId: usuario.id,
      resourceId: usuario.id,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    })

    reply.status(200).send({
      message: result.message,
      success: true,
    })
  } catch (error: any) {
    await auditLogService.logFailure('DISABLE_2FA', 'Usuario', error.message, {
      usuarioId: (request as any).usuario?.id,
      ipAddress: request.ip,
    })

    reply.status(400).send({
      message: error.message,
      success: false,
    })
  }
}

/**
 * POST /2fa/verify
 * Verifica um código 2FA (usado durante login)
 */
export async function verifyTwoFactorCode(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const { userId, code } = request.body as { userId: string; code: string }

    if (!userId || !code) {
      reply.status(400).send({
        message: 'ID do usuário e código são obrigatórios',
        success: false,
      })
      return
    }

    const result = await twoFactorService.verifyTwoFactorCode(userId, code)

    if (result.valid) {
      reply.status(200).send({
        message: 'Código 2FA verificado com sucesso',
        data: {
          valid: true,
          usedBackupCode: result.usedBackupCode,
        },
        success: true,
      })
    } else {
      reply.status(400).send({
        message: 'Código 2FA inválido',
        data: { valid: false },
        success: false,
      })
    }
  } catch (error: any) {
    reply.status(500).send({
      message: 'Erro ao verificar código 2FA',
      error: error.message,
      success: false,
    })
  }
}

/**
 * POST /2fa/regenerate-backup-codes
 * Regenera códigos de backup
 */
export async function regenerateBackupCodes(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { password } = request.body as { password: string }

    if (!usuario?.id) {
      reply.status(401).send({
        message: 'Usuário não autenticado',
        success: false,
      })
      return
    }

    if (!password) {
      reply.status(400).send({
        message: 'Senha é obrigatória',
        success: false,
      })
      return
    }

    const result = await twoFactorService.regenerateBackupCodes(
      usuario.id,
      password,
    )

    await auditLogService.logSuccess('ENABLE_2FA', 'Usuario', {
      usuarioId: usuario.id,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
      details: { action: 'regenerate_backup_codes' },
    })

    reply.status(200).send({
      message: result.message,
      data: {
        backupCodes: result.backupCodes,
      },
      success: true,
    })
  } catch (error: any) {
    reply.status(400).send({
      message: error.message,
      success: false,
    })
  }
}

/**
 * GET /2fa/status
 * Verifica se o usuário tem 2FA habilitado
 */
export async function getTwoFactorStatus(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario

    if (!usuario?.id) {
      reply.status(401).send({
        message: 'Usuário não autenticado',
        success: false,
      })
      return
    }

    const enabled = await twoFactorService.isTwoFactorEnabled(usuario.id)

    reply.status(200).send({
      data: {
        enabled,
        userId: usuario.id,
      },
      success: true,
    })
  } catch (error: any) {
    reply.status(500).send({
      message: 'Erro ao verificar status do 2FA',
      error: error.message,
      success: false,
    })
  }
}

/**
 * GET /2fa/stats
 * Estatísticas de uso de 2FA (apenas admins)
 */
export async function getTwoFactorStats(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const stats = await twoFactorService.getTwoFactorStats()

    reply.status(200).send({
      data: stats,
      success: true,
    })
  } catch (error: any) {
    reply.status(500).send({
      message: 'Erro ao obter estatísticas de 2FA',
      error: error.message,
      success: false,
    })
  }
}
