// src/middleware/usuarioMiddleware.ts
/**
 * Middlewares de validação para rotas de usuários
 *
 * Estes middlewares utilizam os esquemas do pacote viu‑shared para validar
 * entradas de criação, atualização e login de usuários. Em caso de erro
 * de validação, respondem com status 400 e detalhes do erro.
 */

import { FastifyRequest, FastifyReply } from 'fastify'
import {
  CreateUsuarioRequestSchema,
  UpdateUsuarioRequestSchema,
  LoginRequestSchema,
} from '../schemas/validation.js'

export async function validateCreateUsuario(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const resultado = CreateUsuarioRequestSchema.parse(request.body)
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

export async function validateUpdateUsuario(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const resultado = UpdateUsuarioRequestSchema.parse(request.body)
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

export async function validateLogin(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const resultado = LoginRequestSchema.parse(request.body)
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