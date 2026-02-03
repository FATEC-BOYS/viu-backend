/**
 * Serviço de Audit Logging (Registro de Auditoria)
 * Registra todas as ações importantes do sistema para fins de auditoria e compliance
 */

import prisma from '../database/client.js'
import type { Prisma } from '@prisma/client'

export type AuditAction =
  | 'LOGIN'
  | 'LOGOUT'
  | 'REGISTER'
  | 'CREATE_PROJECT'
  | 'UPDATE_PROJECT'
  | 'DELETE_PROJECT'
  | 'CREATE_ARTE'
  | 'UPDATE_ARTE'
  | 'DELETE_ARTE'
  | 'CREATE_FEEDBACK'
  | 'UPDATE_FEEDBACK'
  | 'DELETE_FEEDBACK'
  | 'CREATE_TAREFA'
  | 'UPDATE_TAREFA'
  | 'DELETE_TAREFA'
  | 'UPDATE_USER'
  | 'DELETE_USER'
  | 'ENABLE_2FA'
  | 'DISABLE_2FA'
  | 'PASSWORD_CHANGE'
  | 'PASSWORD_RESET'
  | 'VIEW_SENSITIVE_DATA'

export type AuditResource =
  | 'Usuario'
  | 'Projeto'
  | 'Arte'
  | 'Feedback'
  | 'Tarefa'
  | 'Aprovacao'
  | 'Sessao'
  | 'Auth'

export interface AuditLogData {
  action: AuditAction
  resource: AuditResource
  resourceId?: string
  usuarioId?: string
  ipAddress?: string
  userAgent?: string
  details?: any // JSON object com dados adicionais
  status: 'SUCCESS' | 'FAILURE'
  errorMessage?: string
}

export class AuditLogService {
  /**
   * Cria um registro de auditoria
   */
  async log(data: AuditLogData) {
    try {
      await prisma.auditLog.create({
        data: {
          action: data.action,
          resource: data.resource,
          resourceId: data.resourceId,
          usuarioId: data.usuarioId,
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
          details: (data.details ?? null) as any,
          status: data.status,
          errorMessage: data.errorMessage,
        },
      })
    } catch (error: any) {
      // Não deve lançar erro - logging não deve quebrar a aplicação
      console.error('Erro ao criar audit log:', error.message)
    }
  }

  /**
   * Registra uma ação bem-sucedida
   */
  async logSuccess(
    action: AuditAction,
    resource: AuditResource,
    options: {
      resourceId?: string
      usuarioId?: string
      ipAddress?: string
      userAgent?: string
      details?: any
    } = {},
  ) {
    await this.log({
      action,
      resource,
      ...options,
      status: 'SUCCESS',
    })
  }

  /**
   * Registra uma ação que falhou
   */
  async logFailure(
    action: AuditAction,
    resource: AuditResource,
    errorMessage: string,
    options: {
      resourceId?: string
      usuarioId?: string
      ipAddress?: string
      userAgent?: string
      details?: any
    } = {},
  ) {
    await this.log({
      action,
      resource,
      ...options,
      status: 'FAILURE',
      errorMessage,
    })
  }

  /**
   * Busca logs de auditoria com filtros
   */
  async findLogs(filters: {
    usuarioId?: string
    action?: AuditAction
    resource?: AuditResource
    status?: 'SUCCESS' | 'FAILURE'
    startDate?: Date
    endDate?: Date
    page?: number
    limit?: number
  }) {
    const {
      usuarioId,
      action,
      resource,
      status,
      startDate,
      endDate,
      page = 1,
      limit = 50,
    } = filters

    const where: any = {
      ...(usuarioId && { usuarioId }),
      ...(action && { action }),
      ...(resource && { resource }),
      ...(status && { status }),
      ...(startDate || endDate
        ? {
            criadoEm: {
              ...(startDate && { gte: startDate }),
              ...(endDate && { lte: endDate }),
            },
          }
        : {}),
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
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
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ])

    return {
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    }
  }

  /**
   * Obtém logs de auditoria de um usuário específico
   */
  async getUserLogs(usuarioId: string, limit: number = 50) {
    return this.findLogs({ usuarioId, limit })
  }

  /**
   * Obtém logs de auditoria de um recurso específico
   */
  async getResourceLogs(
    resource: AuditResource,
    resourceId: string,
    limit: number = 50,
  ) {
    const logs = await prisma.auditLog.findMany({
      where: {
        resource,
        resourceId,
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
      orderBy: { criadoEm: 'desc' },
      take: limit,
    })

    return logs
  }

  /**
   * Obtém estatísticas de auditoria
   */
  async getStats(options: {
    usuarioId?: string
    startDate?: Date
    endDate?: Date
  } = {}) {
    const { usuarioId, startDate, endDate } = options

    const where: any = {
      ...(usuarioId && { usuarioId }),
      ...(startDate || endDate
        ? {
            criadoEm: {
              ...(startDate && { gte: startDate }),
              ...(endDate && { lte: endDate }),
            },
          }
        : {}),
    }

    const [total, successCount, failureCount, actionBreakdown, resourceBreakdown] =
      await Promise.all([
        prisma.auditLog.count({ where }),
        prisma.auditLog.count({ where: { ...where, status: 'SUCCESS' } }),
        prisma.auditLog.count({ where: { ...where, status: 'FAILURE' } }),
        prisma.auditLog.groupBy({
          by: ['action'],
          where,
          _count: { action: true },
          orderBy: { _count: { action: 'desc' } },
          take: 10,
        }),
        prisma.auditLog.groupBy({
          by: ['resource'],
          where,
          _count: { resource: true },
          orderBy: { _count: { resource: 'desc' } },
        }),
      ])

    return {
      total,
      successCount,
      failureCount,
      successRate:
        total > 0 ? ((successCount / total) * 100).toFixed(2) + '%' : '0%',
      topActions: actionBreakdown.map((item: any) => ({
        action: item.action,
        count: item._count.action,
      })),
      resourceBreakdown: resourceBreakdown.map((item: any) => ({
        resource: item.resource,
        count: item._count.resource,
      })),
    }
  }

  /**
   * Obtém atividades recentes
   */
  async getRecentActivity(limit: number = 20) {
    const logs = await prisma.auditLog.findMany({
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

    return logs
  }

  /**
   * Limpa logs antigos (para manutenção)
   * Remove logs com mais de X dias
   */
  async cleanOldLogs(daysToKeep: number = 90) {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep)

    const deleted = await prisma.auditLog.deleteMany({
      where: {
        criadoEm: {
          lt: cutoffDate,
        },
      },
    })

    return {
      deleted: deleted.count,
      message: `${deleted.count} logs antigos removidos (mais de ${daysToKeep} dias)`,
    }
  }

  /**
   * Exporta logs para análise externa
   */
  async exportLogs(filters: {
    usuarioId?: string
    startDate?: Date
    endDate?: Date
  }) {
    const logs = await prisma.auditLog.findMany({
      where: {
        ...(filters.usuarioId && { usuarioId: filters.usuarioId }),
        ...(filters.startDate || filters.endDate
          ? {
              criadoEm: {
                ...(filters.startDate && { gte: filters.startDate }),
                ...(filters.endDate && { lte: filters.endDate }),
              },
            }
          : {}),
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
      orderBy: { criadoEm: 'desc' },
    })

    return logs
  }
}

export const auditLogService = new AuditLogService()
