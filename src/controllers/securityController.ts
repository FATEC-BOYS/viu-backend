/**
 * Controller de Segurança (Audit Logs e Security Monitoring)
 */

import { FastifyRequest, FastifyReply } from 'fastify'
import { auditLogService } from '../services/auditLogService.js'
import { securityMonitoringService } from '../services/securityMonitoringService.js'

/**
 * GET /security/audit-logs
 * Lista logs de auditoria com filtros
 */
export async function getAuditLogs(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const query = request.query as any

    const result = await auditLogService.findLogs({
      usuarioId: query.usuarioId,
      action: query.action,
      resource: query.resource,
      status: query.status,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
      page: query.page ? parseInt(query.page) : undefined,
      limit: query.limit ? parseInt(query.limit) : undefined,
    })

    reply.status(200).send({
      data: result,
      success: true,
    })
  } catch (error: any) {
    reply.status(500).send({
      message: 'Erro ao buscar logs de auditoria',
      error: error.message,
      success: false,
    })
  }
}

/**
 * GET /security/audit-logs/stats
 * Estatísticas de auditoria
 */
export async function getAuditStats(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const query = request.query as any

    const stats = await auditLogService.getStats({
      usuarioId: query.usuarioId,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
    })

    reply.status(200).send({
      data: stats,
      success: true,
    })
  } catch (error: any) {
    reply.status(500).send({
      message: 'Erro ao obter estatísticas de auditoria',
      error: error.message,
      success: false,
    })
  }
}

/**
 * GET /security/events
 * Lista eventos de segurança
 */
export async function getSecurityEvents(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const query = request.query as any
    const severity = query.severity

    const events = await securityMonitoringService.getUnresolvedEvents(severity)

    reply.status(200).send({
      data: events,
      success: true,
    })
  } catch (error: any) {
    reply.status(500).send({
      message: 'Erro ao buscar eventos de segurança',
      error: error.message,
      success: false,
    })
  }
}

/**
 * POST /security/events/:id/resolve
 * Marca um evento de segurança como resolvido
 */
export async function resolveSecurityEvent(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const { id } = request.params as { id: string }
    const usuario = (request as any).usuario

    if (!usuario?.id) {
      reply.status(401).send({
        message: 'Usuário não autenticado',
        success: false,
      })
      return
    }

    const event = await securityMonitoringService.resolveEvent(id, usuario.id)

    reply.status(200).send({
      message: 'Evento marcado como resolvido',
      data: event,
      success: true,
    })
  } catch (error: any) {
    reply.status(500).send({
      message: 'Erro ao resolver evento de segurança',
      error: error.message,
      success: false,
    })
  }
}

/**
 * GET /security/dashboard
 * Dashboard de segurança completo
 */
export async function getSecurityDashboard(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const dashboard = await securityMonitoringService.getSecurityDashboard()

    reply.status(200).send({
      data: dashboard,
      success: true,
    })
  } catch (error: any) {
    reply.status(500).send({
      message: 'Erro ao obter dashboard de segurança',
      error: error.message,
      success: false,
    })
  }
}

/**
 * GET /security/stats
 * Estatísticas gerais de segurança
 */
export async function getSecurityStats(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const query = request.query as any

    const stats = await securityMonitoringService.getSecurityStats({
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
    })

    reply.status(200).send({
      data: stats,
      success: true,
    })
  } catch (error: any) {
    reply.status(500).send({
      message: 'Erro ao obter estatísticas de segurança',
      error: error.message,
      success: false,
    })
  }
}

/**
 * GET /security/recent-activity
 * Atividades recentes (audit logs + security events)
 */
export async function getRecentActivity(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const query = request.query as any
    const limit = query.limit ? parseInt(query.limit) : 20

    const [auditLogs, securityEvents] = await Promise.all([
      auditLogService.getRecentActivity(limit),
      securityMonitoringService.getRecentEvents(limit),
    ])

    reply.status(200).send({
      data: {
        auditLogs,
        securityEvents,
      },
      success: true,
    })
  } catch (error: any) {
    reply.status(500).send({
      message: 'Erro ao obter atividades recentes',
      error: error.message,
      success: false,
    })
  }
}

/**
 * GET /security/user/:userId
 * Histórico de segurança de um usuário específico
 */
export async function getUserSecurityHistory(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const { userId } = request.params as { userId: string }
    const query = request.query as any
    const limit = query.limit ? parseInt(query.limit) : 50

    const [auditLogs, securityEvents] = await Promise.all([
      auditLogService.getUserLogs(userId, limit),
      // TODO: Adicionar método getUserEvents no securityMonitoringService
    ])

    reply.status(200).send({
      data: {
        userId,
        auditLogs,
        // securityEvents,
      },
      success: true,
    })
  } catch (error: any) {
    reply.status(500).send({
      message: 'Erro ao obter histórico de segurança do usuário',
      error: error.message,
      success: false,
    })
  }
}
