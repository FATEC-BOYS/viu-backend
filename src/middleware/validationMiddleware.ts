import { FastifyRequest, FastifyReply } from 'fastify'
import { z, ZodSchema } from 'zod'

/**
 * Middleware genérico para validar parâmetros de query string
 * Uso:
 *   fastify.get('/route', { preHandler: [validateQuery(SearchQuerySchema)] }, handler)
 */
export function validateQuery(schema: ZodSchema) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validatedQuery = schema.parse(request.query)
      // Sobrescreve a query com os dados validados e sanitizados
      request.query = validatedQuery
    } catch (error: any) {
      return reply.status(400).send({
        message: 'Parâmetros de query inválidos',
        errors: error.errors?.map((err: any) => ({
          field: err.path.join('.'),
          message: err.message,
        })) || [{ message: error.message }],
        success: false,
      })
    }
  }
}

/**
 * Middleware genérico para validar parâmetros de path (URL params)
 * Uso:
 *   fastify.get('/route/:id', { preHandler: [validateParams(CuidParamSchema)] }, handler)
 */
export function validateParams(schema: ZodSchema) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validatedParams = schema.parse(request.params)
      // Sobrescreve os params com os dados validados
      request.params = validatedParams
    } catch (error: any) {
      return reply.status(400).send({
        message: 'Parâmetros de URL inválidos',
        errors: error.errors?.map((err: any) => ({
          field: err.path.join('.'),
          message: err.message,
        })) || [{ message: error.message }],
        success: false,
      })
    }
  }
}

/**
 * Middleware genérico para validar body da requisição
 * Uso:
 *   fastify.post('/route', { preHandler: [validateBody(CreateUsuarioRequestSchema)] }, handler)
 */
export function validateBody(schema: ZodSchema) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validatedBody = schema.parse(request.body)
      // Sobrescreve o body com os dados validados
      request.body = validatedBody
    } catch (error: any) {
      return reply.status(400).send({
        message: 'Dados da requisição inválidos',
        errors: error.errors?.map((err: any) => ({
          field: err.path.join('.'),
          message: err.message,
        })) || [{ message: error.message }],
        success: false,
      })
    }
  }
}

/**
 * Middleware específico para validar CUIDs em parâmetros
 * Previne SQL injection e timing attacks através de IDs inválidos
 */
export async function validateCuidParam(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const params = request.params as any
  const id = params.id

  if (!id) {
    return reply.status(400).send({
      message: 'ID não fornecido',
      success: false,
    })
  }

  // Valida formato CUID (começa com 'c', tem 25 caracteres, alfanumérico)
  const cuidRegex = /^c[a-z0-9]{24}$/i
  if (!cuidRegex.test(id)) {
    return reply.status(400).send({
      message: 'ID inválido. Deve ser um CUID válido.',
      success: false,
    })
  }
}

/**
 * Middleware para sanitizar e validar parâmetros de paginação
 */
export async function validatePagination(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const query = request.query as any

  try {
    // Valida e converte page
    if (query.page !== undefined) {
      const page = parseInt(query.page, 10)
      if (isNaN(page) || page < 1) {
        return reply.status(400).send({
          message: 'Parâmetro "page" deve ser um número inteiro positivo',
          success: false,
        })
      }
      query.page = page
    } else {
      query.page = 1
    }

    // Valida e converte limit
    if (query.limit !== undefined) {
      const limit = parseInt(query.limit, 10)
      if (isNaN(limit) || limit < 1 || limit > 100) {
        return reply.status(400).send({
          message: 'Parâmetro "limit" deve ser um número entre 1 e 100',
          success: false,
        })
      }
      query.limit = limit
    } else {
      query.limit = 10
    }

    // Sanitiza search string se presente
    if (query.search !== undefined) {
      const search = String(query.search).trim()

      // Limita tamanho da busca
      if (search.length > 100) {
        return reply.status(400).send({
          message: 'Termo de busca muito longo (máximo 100 caracteres)',
          success: false,
        })
      }

      // Remove caracteres perigosos (XSS, SQL injection)
      const sanitized = search.replace(/[<>;"'`${}()]/g, '')
      query.search = sanitized
    }
  } catch (error: any) {
    return reply.status(400).send({
      message: 'Parâmetros de paginação inválidos',
      success: false,
    })
  }
}
