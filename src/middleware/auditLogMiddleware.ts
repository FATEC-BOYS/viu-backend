import { FastifyRequest, FastifyReply } from 'fastify'
import { auditLogService, type AuditAction, type AuditResource } from '../services/auditLogService.js'

function mapRouteToAudit(
  method: string,
  url: string,
): { action: AuditAction; resource: AuditResource } | null {
  if (url.includes('/auth/login')) return { action: 'LOGIN', resource: 'Auth' }
  if (url.includes('/auth/logout')) return { action: 'LOGOUT', resource: 'Auth' }
  if (url.includes('/auth/register')) return { action: 'REGISTER', resource: 'Usuario' }

  if (url.includes('/projetos')) {
    if (method === 'POST') return { action: 'CREATE_PROJECT', resource: 'Projeto' }
    if (method === 'PUT' || method === 'PATCH') return { action: 'UPDATE_PROJECT', resource: 'Projeto' }
    if (method === 'DELETE') return { action: 'DELETE_PROJECT', resource: 'Projeto' }
  }

  if (url.includes('/artes')) {
    // GET /artes/:id = download de arte (signed URL)
    if (method === 'GET' && /\/artes\/[^/]+$/.test(url)) return { action: 'DOWNLOAD_ARTE', resource: 'Arte' }
    if (method === 'POST') return { action: 'CREATE_ARTE', resource: 'Arte' }
    if (method === 'PUT' || method === 'PATCH') return { action: 'UPDATE_ARTE', resource: 'Arte' }
    if (method === 'DELETE') return { action: 'DELETE_ARTE', resource: 'Arte' }
  }

  if (url.includes('/aprovacoes')) {
    if (method === 'POST') return { action: 'APPROVE_ARTE', resource: 'Aprovacao' }
  }

  if (url.includes('/links')) {
    if (method === 'POST') return { action: 'CREATE_LINK', resource: 'Link' }
    // /links/:id/revogar → revogação explícita
    if (method === 'PUT' && url.includes('/revogar')) return { action: 'REVOKE_LINK', resource: 'Link' }
    if (method === 'DELETE') return { action: 'REVOKE_LINK', resource: 'Link' }
  }

  if (url.includes('/feedbacks')) {
    if (method === 'POST') return { action: 'CREATE_FEEDBACK', resource: 'Feedback' }
    if (method === 'PUT' || method === 'PATCH') return { action: 'UPDATE_FEEDBACK', resource: 'Feedback' }
    if (method === 'DELETE') return { action: 'DELETE_FEEDBACK', resource: 'Feedback' }
  }

  if (url.includes('/tarefas')) {
    if (method === 'POST') return { action: 'CREATE_TAREFA', resource: 'Tarefa' }
    if (method === 'PUT' || method === 'PATCH') return { action: 'UPDATE_TAREFA', resource: 'Tarefa' }
    if (method === 'DELETE') return { action: 'DELETE_TAREFA', resource: 'Tarefa' }
  }

  if (url.includes('/usuarios')) {
    if (method === 'PUT' || method === 'PATCH') return { action: 'UPDATE_USER', resource: 'Usuario' }
    if (method === 'DELETE') return { action: 'DELETE_USER', resource: 'Usuario' }
  }

  if (url.includes('/2fa/enable')) return { action: 'ENABLE_2FA', resource: 'Usuario' }
  if (url.includes('/2fa/disable')) return { action: 'DISABLE_2FA', resource: 'Usuario' }
  if (url.includes('/password/change')) return { action: 'PASSWORD_CHANGE', resource: 'Usuario' }
  if (url.includes('/password/reset')) return { action: 'PASSWORD_RESET', resource: 'Usuario' }

  return null
}

function extractResourceId(url: string): string | undefined {
  const match = url.match(/\/([c][a-z0-9]{24})/i)
  return match ? match[1] : undefined
}

export async function auditLogMiddleware(
  request: FastifyRequest,
  _reply: FastifyReply,
) {
  const audit = mapRouteToAudit(request.method, request.url)
  if (!audit) return

  const usuario = (request as any).usuario
  ;(request as any).auditLog = {
    action: audit.action,
    resource: audit.resource,
    resourceId: extractResourceId(request.url),
    usuarioId: usuario?.id,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  }
}

export async function logAuditAction(
  action: AuditAction,
  resource: AuditResource,
  options: {
    resourceId?: string
    usuarioId?: string
    ipAddress?: string
    userAgent?: string
    details?: any
    success: boolean
    errorMessage?: string
  },
) {
  await auditLogService.log({
    action,
    resource,
    ...options,
    status: options.success ? 'SUCCESS' : 'FAILURE',
  })
}
