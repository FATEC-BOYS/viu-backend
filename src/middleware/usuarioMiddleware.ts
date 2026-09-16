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
  ResolverClienteRequestSchema,
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

export async function validateResolverCliente(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    // eslint-disable-next-line no-param-reassign
    request.body = ResolverClienteRequestSchema.parse(request.body)
  } catch (error: any) {
    reply.status(400).send({
      message: 'Dados inválidos',
      errors: error.errors,
      success: false,
    })
  }
}

/**
 * `POST /usuarios` é o designer cadastrando o cliente dele pelo wizard — não
 * uma segunda porta de cadastro. Sem esta restrição, uma conta comum podia
 * criar contas de DESIGNER por ali, fora do cadastro público e portanto sem
 * captcha, sem limite por IP e sem linha de auditoria de REGISTER.
 *
 * Recusa em vez de corrigir o `tipo` calado: quem chamou errado precisa
 * descobrir, e o silêncio esconderia justamente a tentativa que interessa ver.
 */
export async function restringirCriacaoACliente(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { tipo } = (request.body ?? {}) as { tipo?: string }
  if (tipo !== 'CLIENTE') {
    reply.status(403).send({
      message: 'Por esta rota só é possível cadastrar clientes.',
      success: false,
    })
  }
}

/**
 * O cadastro público não passa sem aceitar os termos.
 *
 * A checagem é de rota e não de schema porque o mesmo schema valida `POST
 * /usuarios` — o designer cadastrando o cliente dele —, onde o cliente não
 * está presente para aceitar. Aceite marcado por outra pessoa é pior do que
 * aceite ausente: parece prova e não é.
 *
 * Recusa com 400 e a razão em texto: é erro de quem chamou, e o formulário
 * precisa dizer o que faltou marcar.
 */
export async function exigirAceiteDosTermos(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { aceiteTermos } = (request.body ?? {}) as { aceiteTermos?: boolean }
  if (aceiteTermos !== true) {
    reply.status(400).send({
      message: 'É preciso aceitar os termos de uso e o aviso de privacidade para criar a conta.',
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