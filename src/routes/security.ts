/**
 * Rotas de Segurança (Audit Logs e Security Monitoring)
 */

import { FastifyInstance } from 'fastify'
import {
  getAuditLogs,
  getAuditStats,
  getSecurityEvents,
  resolveSecurityEvent,
  getSecurityDashboard,
  getSecurityStats,
  getRecentActivity,
  getUserSecurityHistory,
} from '../controllers/securityController.js'
import { authenticate } from '../middleware/authMiddleware.js'
import { requireRole } from '../middleware/authorizationMiddleware.js'
import { validatePagination, validateCuidParam } from '../middleware/validationMiddleware.js'

export async function securityRoutes(fastify: FastifyInstance) {
  // ===== AUDIT LOGS =====

  // Lista logs de auditoria (apenas admins)
  fastify.get(
    '/security/audit-logs',
    { preHandler: [authenticate, requireRole('ADMIN'), validatePagination] },
    getAuditLogs,
  )

  // Estatísticas de auditoria (apenas admins)
  fastify.get(
    '/security/audit-logs/stats',
    { preHandler: [authenticate, requireRole('ADMIN')] },
    getAuditStats,
  )

  // ===== SECURITY EVENTS =====

  // Lista eventos de segurança não resolvidos (apenas admins)
  fastify.get(
    '/security/events',
    { preHandler: [authenticate, requireRole('ADMIN')] },
    getSecurityEvents,
  )

  // Resolve um evento de segurança (apenas admins)
  fastify.post(
    '/security/events/:id/resolve',
    { preHandler: [authenticate, requireRole('ADMIN'), validateCuidParam] },
    resolveSecurityEvent,
  )

  // ===== DASHBOARD & STATS =====

  // Dashboard completo de segurança (apenas admins)
  fastify.get(
    '/security/dashboard',
    { preHandler: [authenticate, requireRole('ADMIN')] },
    getSecurityDashboard,
  )

  // Estatísticas gerais de segurança (apenas admins)
  fastify.get(
    '/security/stats',
    { preHandler: [authenticate, requireRole('ADMIN')] },
    getSecurityStats,
  )

  // ===== ACTIVITY =====

  // Atividades recentes (apenas admins)
  fastify.get(
    '/security/recent-activity',
    { preHandler: [authenticate, requireRole('ADMIN')] },
    getRecentActivity,
  )

  // Histórico de segurança de um usuário (apenas admins)
  fastify.get(
    '/security/user/:userId',
    { preHandler: [authenticate, requireRole('ADMIN'), validateCuidParam] },
    getUserSecurityHistory,
  )
}
