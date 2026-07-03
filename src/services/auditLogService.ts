import prisma from '../database/client.js'

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
  | 'DOWNLOAD_ARTE'
  | 'CREATE_FEEDBACK'
  | 'UPDATE_FEEDBACK'
  | 'DELETE_FEEDBACK'
  | 'CREATE_TAREFA'
  | 'UPDATE_TAREFA'
  | 'DELETE_TAREFA'
  | 'APPROVE_ARTE'
  | 'REJECT_ARTE'
  | 'CREATE_LINK'
  | 'REVOKE_LINK'
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
  | 'Link'

export interface AuditLogData {
  action: AuditAction
  resource: AuditResource
  resourceId?: string
  usuarioId?: string
  ipAddress?: string
  userAgent?: string
  details?: any
  status: 'SUCCESS' | 'FAILURE'
  errorMessage?: string
}

export class AuditLogService {
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
      console.error('Erro ao criar audit log:', error.message)
    }
  }

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
    await this.log({ action, resource, ...options, status: 'SUCCESS' })
  }

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
    await this.log({ action, resource, ...options, status: 'FAILURE', errorMessage })
  }

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
    const { usuarioId, action, resource, status, startDate, endDate, page = 1, limit = 50 } = filters

    const where: any = {
      ...(usuarioId && { usuarioId }),
      ...(action && { action }),
      ...(resource && { resource }),
      ...(status && { status }),
      ...(startDate || endDate
        ? { criadoEm: { ...(startDate && { gte: startDate }), ...(endDate && { lte: endDate }) } }
        : {}),
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: { usuario: { select: { id: true, nome: true, email: true, tipo: true } } },
        orderBy: { criadoEm: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ])

    return { logs, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } }
  }

  async getUserLogs(usuarioId: string, limit = 50) {
    return this.findLogs({ usuarioId, limit })
  }

  async getResourceLogs(resource: AuditResource, resourceId: string, limit = 50) {
    return prisma.auditLog.findMany({
      where: { resource, resourceId },
      include: { usuario: { select: { id: true, nome: true, email: true, tipo: true } } },
      orderBy: { criadoEm: 'desc' },
      take: limit,
    })
  }

  async getStats(options: { usuarioId?: string; startDate?: Date; endDate?: Date } = {}) {
    const { usuarioId, startDate, endDate } = options
    const where: any = {
      ...(usuarioId && { usuarioId }),
      ...(startDate || endDate
        ? { criadoEm: { ...(startDate && { gte: startDate }), ...(endDate && { lte: endDate }) } }
        : {}),
    }

    const [total, successCount, failureCount, actionBreakdown, resourceBreakdown] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.count({ where: { ...where, status: 'SUCCESS' } }),
      prisma.auditLog.count({ where: { ...where, status: 'FAILURE' } }),
      prisma.auditLog.groupBy({ by: ['action'], where, _count: { action: true }, orderBy: { _count: { action: 'desc' } }, take: 10 }),
      prisma.auditLog.groupBy({ by: ['resource'], where, _count: { resource: true }, orderBy: { _count: { resource: 'desc' } } }),
    ])

    return {
      total,
      successCount,
      failureCount,
      successRate: total > 0 ? ((successCount / total) * 100).toFixed(2) + '%' : '0%',
      topActions: actionBreakdown.map((i: any) => ({ action: i.action, count: i._count.action })),
      resourceBreakdown: resourceBreakdown.map((i: any) => ({ resource: i.resource, count: i._count.resource })),
    }
  }

  async getRecentActivity(limit = 20) {
    return prisma.auditLog.findMany({
      include: { usuario: { select: { id: true, nome: true, email: true, tipo: true } } },
      orderBy: { criadoEm: 'desc' },
      take: limit,
    })
  }

  async cleanOldLogs(daysToKeep = 90) {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep)
    const deleted = await prisma.auditLog.deleteMany({ where: { criadoEm: { lt: cutoffDate } } })
    return { deleted: deleted.count, message: `${deleted.count} logs antigos removidos (>${daysToKeep} dias)` }
  }

  async exportLogs(filters: { usuarioId?: string; startDate?: Date; endDate?: Date }) {
    return prisma.auditLog.findMany({
      where: {
        ...(filters.usuarioId && { usuarioId: filters.usuarioId }),
        ...(filters.startDate || filters.endDate
          ? { criadoEm: { ...(filters.startDate && { gte: filters.startDate }), ...(filters.endDate && { lte: filters.endDate }) } }
          : {}),
      },
      include: { usuario: { select: { id: true, nome: true, email: true, tipo: true } } },
      orderBy: { criadoEm: 'desc' },
    })
  }
}

export const auditLogService = new AuditLogService()
