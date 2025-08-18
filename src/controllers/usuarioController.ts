// src/controllers/usuarioController.ts
/**
 * Controladores de Usuários
 *
 * Orquestra a camada de serviços de usuários para processar as
 * requisições HTTP e formatar as respostas. Cada função captura erros
 * específicos para devolver o status HTTP apropriado.
 */

import { FastifyRequest, FastifyReply } from 'fastify'
import { UsuarioService, ListUsuariosParams } from '../services/usuarioService.js'

const usuarioService = new UsuarioService()

/**
 * Lista usuários com paginação e filtros.
 */
export async function listUsuarios(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const { page = 1, limit = 10, tipo, ativo } = (request.query || {}) as any
    const params: ListUsuariosParams = {
      page: Number(page),
      limit: Number(limit),
      tipo: tipo as string | undefined,
      ativo: ativo as any,
    }
    const { usuarios, total } = await usuarioService.listUsuarios(params)
    reply.send({
      data: usuarios,
      pagination: {
        page: params.page,
        limit: params.limit,
        total,
        pages: Math.ceil(total / params.limit),
      },
      success: true,
    })
  } catch (error: any) {
    reply.status(500).send({
      message: 'Erro ao buscar usuários',
      error: error.message,
      success: false,
    })
  }
}

/**
 * Busca usuário por ID.
 */
export async function getUsuarioById(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const { id } = request.params as { id: string }
    const usuario = await usuarioService.getUsuarioById(id)
    if (!usuario) {
      reply.status(404).send({
        message: 'Usuário não encontrado',
        success: false,
      })
      return
    }
    reply.send({ data: usuario, success: true })
  } catch (error: any) {
    reply.status(500).send({
      message: 'Erro ao buscar usuário',
      error: error.message,
      success: false,
    })
  }
}

/**
 * Cria um usuário.
 */
export async function createUsuario(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const userData = request.body
    const usuario = await usuarioService.createUsuario(userData)
    reply.status(201).send({
      message: 'Usuário criado com sucesso',
      data: usuario,
      success: true,
    })
  } catch (error: any) {
    if (error.message.includes('Email já está em uso')) {
      reply.status(400).send({ message: error.message, success: false })
      return
    }
    if (error.name === 'ZodError') {
      reply.status(400).send({
        message: 'Dados inválidos',
        errors: error.errors,
        success: false,
      })
      return
    }
    reply.status(500).send({
      message: 'Erro ao criar usuário',
      error: error.message,
      success: false,
    })
  }
}

/**
 * Atualiza um usuário.
 */
export async function updateUsuario(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const { id } = request.params as { id: string }
    const updateData = request.body
    const usuario = await usuarioService.updateUsuario(id, updateData)
    reply.send({
      message: 'Usuário atualizado com sucesso',
      data: usuario,
      success: true,
    })
  } catch (error: any) {
    if (error.message.includes('Usuário não encontrado')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    if (error.message.includes('Email já está em uso')) {
      reply.status(400).send({ message: error.message, success: false })
      return
    }
    if (error.name === 'ZodError') {
      reply.status(400).send({
        message: 'Dados inválidos',
        errors: error.errors,
        success: false,
      })
      return
    }
    reply.status(500).send({
      message: 'Erro ao atualizar usuário',
      error: error.message,
      success: false,
    })
  }
}

/**
 * Desativa (soft delete) um usuário.
 */
export async function deactivateUsuario(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const { id } = request.params as { id: string }
    await usuarioService.deactivateUsuario(id)
    reply.send({ message: 'Usuário desativado com sucesso', success: true })
  } catch (error: any) {
    if (error.message.includes('Usuário não encontrado')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({
      message: 'Erro ao desativar usuário',
      error: error.message,
      success: false,
    })
  }
}

/**
 * Realiza login de usuário.
 */
export async function loginUsuario(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const loginData = request.body
    const resultado = await usuarioService.login(loginData)
    reply.send({
      message: 'Login realizado com sucesso',
      data: resultado,
      success: true,
    })
  } catch (error: any) {
    if (error.message.includes('Email ou senha inválidos')) {
      reply.status(401).send({ message: error.message, success: false })
      return
    }
    if (error.name === 'ZodError') {
      reply.status(400).send({
        message: 'Dados inválidos',
        errors: error.errors,
        success: false,
      })
      return
    }
    reply.status(500).send({
      message: 'Erro no login',
      error: error.message,
      success: false,
    })
  }
}

/**
 * Obtém estatísticas de usuários.
 */
export async function statsOverview(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const data = await usuarioService.statsOverview()
    reply.send({ data, success: true })
  } catch (error: any) {
    reply.status(500).send({
      message: 'Erro ao buscar estatísticas',
      error: error.message,
      success: false,
    })
  }
}