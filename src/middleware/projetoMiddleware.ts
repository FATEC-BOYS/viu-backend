// src/middleware/projetoMiddleware.ts
/**
 * Middlewares específicos para rotas de projetos
 *
 * Esta camada de middleware lida com a validação de entrada usando os
 * esquemas fornecidos pelo pacote viu‑shared. Ela deve ser registrada
 * como `preHandler` nas rotas correspondentes para garantir que os dados
 * sejam validados antes de chegar à camada de controller.
 */

import { FastifyRequest, FastifyReply } from 'fastify'
import {
  CreateProjetoRequestSchema,
  UpdateProjetoRequestSchema,
} from '../schemas/validation.js'

/**
 * Valida o corpo de uma requisição de criação de projeto. Caso os dados
 * não estejam em conformidade com o esquema Zod, retorna erro 400.
 */
export async function validateCreateProjeto(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const resultado = CreateProjetoRequestSchema.parse(request.body)
    // sobrescreve request.body com dados validados/transformados
    // eslint-disable-next-line no-param-reassign
    request.body = resultado
  } catch (error: any) {
    reply.status(400).send({
      message: 'Dados inválidos',
      errors: error.errors,
      success: false,
    })
  }
}

/**
 * Valida o corpo de uma requisição de atualização de projeto. Caso os dados
 * não estejam em conformidade com o esquema Zod, retorna erro 400.
 */
export async function validateUpdateProjeto(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const resultado = UpdateProjetoRequestSchema.parse(request.body)
    // eslint-disable-next-line no-param-reassign
    request.body = resultado
  } catch (error: any) {
    reply.status(400).send({
      message: 'Dados inválidos',
      errors: error.errors,
      success: false,
    })
  }
}