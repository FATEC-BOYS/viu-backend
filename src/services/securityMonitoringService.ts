/**
 * Serviço de Monitoramento de Segurança
 * Detecta e registra eventos de segurança suspeitos
 */

import prisma from '../database/client.js'
import type { Prisma } from '@prisma/client'

export type SecurityEventType =
  | 'FAILED_LOGIN'
  | 'ACCOUNT_LOCKOUT'
  | 'SUSPICIOUS_ACTIVITY'
  | 'PASSWORD_CHANGE'
  | 'PASSWORD_RESET_REQUEST'
  | 'MULTIPLE_FAILED_2FA'
  | 'UNUSUAL_LOCATION'
  | 'UNUSUAL_TIME'
  | 'RAPID_API_CALLS'
  | 'PRIVILEGE_ESCALATION_ATTEMPT'
  | 'UNAUTHORIZED_ACCESS_ATTEMPT'

export type SecuritySeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export interface SecurityEventData {
  eventType: SecurityEventType
  severity: SecuritySeverity
  description: string
  usuarioId?: string
  ipAddress?: string
  userAgent?: string
  location?: string
  details?: any
}

export class SecurityMonitoringService {
  // Thresholds para detecção de atividades suspeitas
  private readonly FAILED_LOGIN_THRESHOLD = 5 // tentativas em 15 minutos
  private readonly FAILED_LOGIN_WINDOW = 15 * 60 * 1000 // 15 minutos
  private readonly FAILED_2FA_THRESHOLD = 3 // tentativas em 5 minutos
  private readonly RAPID_API_THRESHOLD = 100 // requisições em 1 minuto

  /**
   * Registra um evento de segurança
   */
  async logEvent(data: SecurityEventData) {
    try {
      const event = await prisma.securityEvent.create({
        data: {
          eventType: data.eventType,
          severity: data.severity,
          description: data.description,
          usuarioId: data.usuarioId,
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
          location: data.location,
          details: (data.details ?? null) as any,
        },
      })

      // Se for evento crítico, pode disparar alertas aqui
      if (data.severity === 'CRITICAL') {
        await this.triggerCriticalAlert(event)
      }

      return event
    } catch (error: any) {
      console.error('Erro ao registrar evento de segurança:', error.message)
      throw error
    }
  }

  /**
   * Registra tentativa de login falha e verifica se deve bloquear conta
   */
  async trackFailedLogin(usuarioId: string, ipAddress: string, userAgent?: string) {
    // Registra o evento
    await this.logEvent({
      eventType: 'FAILED_LOGIN',
      severity: 'LOW',
      description: 'Tentativa de login falhou',
      usuarioId,
      ipAddress,
      userAgent,
    })

    // Verifica quantas tentativas falhas nos últimos 15 minutos
    const recentFailures = await this.getRecentFailedLogins(usuarioId)

    if (recentFailures >= this.FAILED_LOGIN_THRESHOLD) {
      // Bloqueia a conta temporariamente
      await this.logEvent({
        eventType: 'ACCOUNT_LOCKOUT',
        severity: 'HIGH',
        description: `Conta bloqueada após ${recentFailures} tentativas de login falhas`,
        usuarioId,
        ipAddress,
        details: {
          failedAttempts: recentFailures,
          threshold: this.FAILED_LOGIN_THRESHOLD,
        },
      })

      return {
        locked: true,
        message: 'Conta temporariamente bloqueada por múltiplas tentativas falhas',
      }
    }

    return {
      locked: false,
      remainingAttempts: this.FAILED_LOGIN_THRESHOLD - recentFailures,
    }
  }

  /**
   * Obtém número de tentativas de login falhas recentes
   */
  async getRecentFailedLogins(usuarioId: string): Promise<number> {
    const cutoffTime = new Date(Date.now() - this.FAILED_LOGIN_WINDOW)

    const count = await prisma.securityEvent.count({
      where: {
        usuarioId,
        eventType: 'FAILED_LOGIN',
        criadoEm: {
          gte: cutoffTime,
        },
      },
    })

    return count
  }

  /**
   * Verifica se uma conta está bloqueada
   */
  async isAccountLocked(usuarioId: string): Promise<boolean> {
    const recentLockout = await prisma.securityEvent.findFirst({
      where: {
        usuarioId,
        eventType: 'ACCOUNT_LOCKOUT',
        criadoEm: {
          gte: new Date(Date.now() - 30 * 60 * 1000), // últimos 30 minutos
        },
      },
      orderBy: { criadoEm: 'desc' },
    })

    return !!recentLockout
  }

  /**
   * Registra tentativa de 2FA falha
   */
  async trackFailed2FA(usuarioId: string, ipAddress: string) {
    await this.logEvent({
      eventType: 'MULTIPLE_FAILED_2FA',
      severity: 'MEDIUM',
      description: 'Tentativa de verificação 2FA falhou',
      usuarioId,
      ipAddress,
    })

    // Verifica quantas tentativas falhas recentes
    const cutoffTime = new Date(Date.now() - 5 * 60 * 1000) // 5 minutos
    const recentFailures = await prisma.securityEvent.count({
      where: {
        usuarioId,
        eventType: 'MULTIPLE_FAILED_2FA',
        criadoEm: { gte: cutoffTime },
      },
    })

    if (recentFailures >= this.FAILED_2FA_THRESHOLD) {
      await this.logEvent({
        eventType: 'SUSPICIOUS_ACTIVITY',
        severity: 'HIGH',
        description: `Múltiplas tentativas falhas de 2FA (${recentFailures})`,
        usuarioId,
        ipAddress,
        details: { failedAttempts: recentFailures },
      })
    }
  }

  /**
   * Detecta atividade suspeita baseada em localização
   */
  async detectUnusualLocation(
    usuarioId: string,
    currentIp: string,
    currentLocation: string,
  ) {
    // Busca logins recentes do usuário
    const recentLogins = await prisma.securityEvent.findMany({
      where: {
        usuarioId,
        eventType: 'FAILED_LOGIN',
        criadoEm: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // últimas 24 horas
        },
      },
      orderBy: { criadoEm: 'desc' },
      take: 10,
    })

    // Verifica se há mudança brusca de localização
    // TODO: Implementar lógica de geolocalização real
    const hasUnusualLocation = false // Placeholder

    if (hasUnusualLocation) {
      await this.logEvent({
        eventType: 'UNUSUAL_LOCATION',
        severity: 'MEDIUM',
        description: 'Login de localização incomum detectado',
        usuarioId,
        ipAddress: currentIp,
        location: currentLocation,
      })
    }
  }

  /**
   * Detecta chamadas rápidas de API (possível bot)
   */
  async detectRapidApiCalls(usuarioId: string, ipAddress: string) {
    // TODO: Implementar rate limiting inteligente
    await this.logEvent({
      eventType: 'RAPID_API_CALLS',
      severity: 'MEDIUM',
      description: 'Chamadas rápidas de API detectadas',
      usuarioId,
      ipAddress,
    })
  }

  /**
   * Registra tentativa de escalação de privilégios
   */
  async trackPrivilegeEscalation(
    usuarioId: string,
    attemptedAction: string,
    ipAddress: string,
  ) {
    await this.logEvent({
      eventType: 'PRIVILEGE_ESCALATION_ATTEMPT',
      severity: 'CRITICAL',
      description: 'Tentativa de escalação de privilégios detectada',
      usuarioId,
      ipAddress,
      details: {
        attemptedAction,
      },
    })
  }

  /**
   * Obtém eventos de segurança não resolvidos
   */
  async getUnresolvedEvents(severity?: SecuritySeverity) {
    const events = await prisma.securityEvent.findMany({
      where: {
        resolved: false,
        ...(severity && { severity }),
      },
      include: {
        usuario: {
          select: {
            id: true,
            nome: true,
            email: true,
            tipo: true,
          },
        },
      },
      orderBy: [{ severity: 'desc' }, { criadoEm: 'desc' }],
    })

    return events
  }

  /**
   * Marca um evento como resolvido
   */
  async resolveEvent(eventId: string, resolvedBy: string) {
    const event = await prisma.securityEvent.update({
      where: { id: eventId },
      data: {
        resolved: true,
        resolvedAt: new Date(),
        resolvedBy,
      },
    })

    return event
  }

  /**
   * Obtém estatísticas de segurança
   */
  async getSecurityStats(options: {
    startDate?: Date
    endDate?: Date
  } = {}) {
    const { startDate, endDate } = options

    const where: any = {
      ...(startDate || endDate
        ? {
            criadoEm: {
              ...(startDate && { gte: startDate }),
              ...(endDate && { lte: endDate }),
            },
          }
        : {}),
    }

    const [
      total,
      unresolved,
      bySeverity,
      byType,
      failedLogins,
      accountLockouts,
    ] = await Promise.all([
      prisma.securityEvent.count({ where }),
      prisma.securityEvent.count({ where: { ...where, resolved: false } }),
      prisma.securityEvent.groupBy({
        by: ['severity'],
        where,
        _count: { severity: true },
      }),
      prisma.securityEvent.groupBy({
        by: ['eventType'],
        where,
        _count: { eventType: true },
        orderBy: { _count: { eventType: 'desc' } },
        take: 10,
      }),
      prisma.securityEvent.count({
        where: { ...where, eventType: 'FAILED_LOGIN' },
      }),
      prisma.securityEvent.count({
        where: { ...where, eventType: 'ACCOUNT_LOCKOUT' },
      }),
    ])

    return {
      total,
      unresolved,
      resolved: total - unresolved,
      bySeverity: bySeverity.map((item: any) => ({
        severity: item.severity,
        count: item._count.severity,
      })),
      topEventTypes: byType.map((item: any) => ({
        eventType: item.eventType,
        count: item._count.eventType,
      })),
      failedLogins,
      accountLockouts,
    }
  }

  /**
   * Obtém dashboard de segurança
   */
  async getSecurityDashboard() {
    const now = new Date()
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    const [stats24h, stats7d, criticalEvents, recentEvents] = await Promise.all([
      this.getSecurityStats({ startDate: last24Hours }),
      this.getSecurityStats({ startDate: last7Days }),
      this.getUnresolvedEvents('CRITICAL'),
      this.getRecentEvents(10),
    ])

    return {
      last24Hours: stats24h,
      last7Days: stats7d,
      criticalEvents,
      recentEvents,
    }
  }

  /**
   * Obtém eventos recentes
   */
  async getRecentEvents(limit: number = 20) {
    const events = await prisma.securityEvent.findMany({
      include: {
        usuario: {
          select: {
            id: true,
            nome: true,
            email: true,
            tipo: true,
          },
        },
      },
      orderBy: { criadoEm: 'desc' },
      take: limit,
    })

    return events
  }

  /**
   * Dispara alerta crítico (pode enviar email, Slack, etc)
   */
  private async triggerCriticalAlert(event: any) {
    // TODO: Implementar sistema de alertas (email, Slack, PagerDuty, etc)
    console.error('🚨 ALERTA CRÍTICO DE SEGURANÇA:', {
      id: event.id,
      type: event.eventType,
      description: event.description,
      usuario: event.usuarioId,
      timestamp: event.criadoEm,
    })

    // Placeholder para integração futura
    // await emailService.sendSecurityAlert(event)
    // await slackService.sendMessage(event)
  }

  /**
   * Limpa eventos antigos resolvidos (manutenção)
   */
  async cleanOldResolvedEvents(daysToKeep: number = 90) {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep)

    const deleted = await prisma.securityEvent.deleteMany({
      where: {
        resolved: true,
        criadoEm: {
          lt: cutoffDate,
        },
      },
    })

    return {
      deleted: deleted.count,
      message: `${deleted.count} eventos resolvidos antigos removidos`,
    }
  }
}

export const securityMonitoringService = new SecurityMonitoringService()
