/**
 * Middleware de Audit Logging
 * Intercepta requisições e registra ações importantes
 */

import { FastifyRequest, FastifyReply } from 'fastify'
import { auditLogService, type AuditAction, type AuditResource } from '../services/auditLogService.js'

/**
 * Mapeia rotas e métodos HTTP para ações de auditoria
 */
function mapRouteToAudit(
  method: string,
  url: string,
): { action: AuditAction; resource: AuditResource } | null {
  // Login/Logout
  if (url.includes('/auth/login')) {
    return { action: 'LOGIN', resource: 'Auth' }
  }
  if (url.includes('/auth/logout')) {
    return { action: 'LOGOUT', resource: 'Auth' }
  }
  if (url.includes('/auth/register')) {
    return { action: 'REGISTER', resource: 'Usuario' }
  }

  // Projetos
  if (url.includes('/projetos')) {
    if (method === 'POST') return { action: 'CREATE_PROJECT', resource: 'Projeto' }
    if (method === 'PUT' || method === 'PATCH')
      return { action: 'UPDATE_PROJECT', resource: 'Projeto' }
    if (method === 'DELETE') return { action: 'DELETE_PROJECT', resource: 'Projeto' }
  }

  // Artes
  if (url.includes('/artes')) {
    if (method === 'POST') return { action: 'CREATE_ARTE', resource: 'Arte' }
    if (method === 'PUT' || method === 'PATCH')
      return { action: 'UPDATE_ARTE', resource: 'Arte' }
    if (method === 'DELETE') return { action: 'DELETE_ARTE', resource: 'Arte' }
  }

  // Feedbacks
  if (url.includes('/feedbacks')) {
    if (method === 'POST') return { action: 'CREATE_FEEDBACK', resource: 'Feedback' }
    if (method === 'PUT' || method === 'PATCH')
      return { action: 'UPDATE_FEEDBACK', resource: 'Feedback' }
    if (method === 'DELETE') return { action: 'DELETE_FEEDBACK', resource: 'Feedback' }
  }

  // Tarefas
  if (url.includes('/tarefas')) {
    if (method === 'POST') return { action: 'CREATE_TAREFA', resource: 'Tarefa' }
    if (method === 'PUT' || method === 'PATCH')
      return { action: 'UPDATE_TAREFA', resource: 'Tarefa' }
    if (method === 'DELETE') return { action: 'DELETE_TAREFA', resource: 'Tarefa' }
  }

  // Usuários
  if (url.includes('/usuarios')) {
    if (method === 'PUT' || method === 'PATCH')
      return { action: 'UPDATE_USER', resource: 'Usuario' }
    if (method === 'DELETE') return { action: 'DELETE_USER', resource: 'Usuario' }
  }

  // 2FA
  if (url.includes('/2fa/enable')) {
    return { action: 'ENABLE_2FA', resource: 'Usuario' }
  }
  if (url.includes('/2fa/disable')) {
    return { action: 'DISABLE_2FA', resource: 'Usuario' }
  }

  // Password
  if (url.includes('/password/change')) {
    return { action: 'PASSWORD_CHANGE', resource: 'Usuario' }
  }
  if (url.includes('/password/reset')) {
    return { action: 'PASSWORD_RESET', resource: 'Usuario' }
  }

  return null
}

/**
 * Extrai o ID do recurso da URL
 */
function extractResourceId(url: string): string | undefined {
  // Regex para pegar IDs no formato CUID (começam com 'c' e têm 25 caracteres)
  const match = url.match(/\/([c][a-z0-9]{24})/i)
  return match ? match[1] : undefined
}

/**
 * Middleware principal de audit logging
 */
export async function auditLogMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const audit = mapRouteToAudit(request.method, request.url)

  if (!audit) {
    // Não é uma ação que precisa de auditoria
    return
  }

  const usuario = (request as any).usuario
  const resourceId = extractResourceId(request.url)
  const ipAddress = request.ip
  const userAgent = request.headers['user-agent']

  // Cria uma função para logar após a resposta
  const logAudit = async (success: boolean, errorMessage?: string) => {
    try {
      await auditLogService.log({
        action: audit.action,
        resource: audit.resource,
        resourceId,
        usuarioId: usuario?.id,
        ipAddress,
        userAgent,
        details: {
          method: request.method,
          url: request.url,
          body: request.method !== 'GET' ? request.body : undefined,
          query: request.query,
        },
        status: success ? 'SUCCESS' : 'FAILURE',
        errorMessage,
      })
    } catch (error: any) {
      // Não deve quebrar a aplicação se o log falhar
      console.error('Erro ao registrar audit log:', error.message)
    }
  }

  // Hook para registrar após a resposta ser enviada
  reply.addHook('onSend', async (request, reply, payload) => {
    const success = reply.statusCode >= 200 && reply.statusCode < 400
    await logAudit(success)
    return payload
  })

  // Hook para capturar erros
  reply.addHook('onError', async (request, reply, error) => {
    await logAudit(false, error.message)
  })
}

/**
 * Helper para registrar audit log manualmente em controllers
 */
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
