import { FastifyError, FastifyReply, FastifyRequest } from 'fastify'

/**
 * Middleware global de tratamento de erros
 * Sanitiza mensagens de erro em produção para prevenir vazamento de informações
 */
export function setupErrorHandler(app: any) {
  app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    const isProduction = process.env.NODE_ENV === 'production'

    // Log do erro completo no servidor (sempre)
    app.log.error({
      error: error.message,
      stack: error.stack,
      statusCode: error.statusCode,
      url: request.url,
      method: request.method,
      ip: request.ip,
    })

    // Determina o status code
    const statusCode = error.statusCode || 500

    // Em produção, retorna mensagens genéricas
    if (isProduction) {
      // Erros de validação (400-499) podem mostrar mensagem original
      if (statusCode >= 400 && statusCode < 500) {
        return reply.status(statusCode).send({
          success: false,
          message: error.message || 'Requisição inválida',
          statusCode: statusCode,
        })
      }

      // Erros de servidor (500+) retornam mensagem genérica
      return reply.status(statusCode).send({
        success: false,
        message: 'Erro interno do servidor',
        statusCode: statusCode,
        // Em produção, não exponha detalhes do erro
      })
    }

    // Em desenvolvimento, retorna todos os detalhes do erro
    return reply.status(statusCode).send({
      success: false,
      message: error.message,
      statusCode: statusCode,
      stack: error.stack,
      validation: (error as any).validation,
      // Informações adicionais úteis para debug
    })
  })
}

/**
 * Helper para sanitizar mensagens de erro antes de enviar ao cliente
 * Use esta função em blocos try-catch para garantir que erros sensíveis não vazem
 */
export function sanitizeErrorMessage(error: any, isProduction: boolean = process.env.NODE_ENV === 'production'): string {
  if (!isProduction) {
    return error.message || 'Erro desconhecido'
  }

  // Lista de padrões sensíveis que não devem ser expostos
  const sensitivePatterns = [
    /ECONNREFUSED/i,
    /ENOTFOUND/i,
    /connect ETIMEDOUT/i,
    /prisma/i,
    /database/i,
    /password/i,
    /token/i,
    /secret/i,
    /key/i,
    /\/home\//i,
    /\/usr\//i,
    /\/var\//i,
    /\.env/i,
    /node_modules/i,
  ]

  const message = error.message || ''

  // Se a mensagem contém informação sensível, retorna mensagem genérica
  for (const pattern of sensitivePatterns) {
    if (pattern.test(message)) {
      return 'Ocorreu um erro. Por favor, tente novamente mais tarde.'
    }
  }

  return message
}

/**
 * Wrapper para try-catch que automaticamente sanitiza erros
 * Exemplo de uso:
 *
 * await safeExecute(
 *   async () => {
 *     // código que pode lançar erro
 *   },
 *   reply,
 *   'Erro ao processar requisição'
 * )
 */
export async function safeExecute<T>(
  fn: () => Promise<T>,
  reply: FastifyReply,
  defaultMessage: string = 'Erro ao processar requisição',
  statusCode: number = 500,
): Promise<T | void> {
  try {
    return await fn()
  } catch (error: any) {
    const isProduction = process.env.NODE_ENV === 'production'
    const message = sanitizeErrorMessage(error, isProduction)

    return reply.status(statusCode).send({
      success: false,
      message: isProduction ? defaultMessage : message,
    })
  }
}
