import { FastifyRequest, FastifyReply } from 'fastify'
import { UsuarioService, ListUsuariosParams } from '../services/usuarioService.js'

const usuarioService = new UsuarioService()

export async function listUsuarios(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const { page = 1, limit = 10, tipo, ativo } = (request.query || {}) as any
    const pageNumber = Number(page)
    const limitNumber = Number(limit)

    const params: ListUsuariosParams = {
      page: pageNumber,
      limit: limitNumber,
      tipo: tipo as string | undefined,
      ativo: ativo as any,
    }
    const { usuarios, total } = await usuarioService.listUsuarios(params)
    reply.send({
      data: usuarios,
      pagination: {
        page: pageNumber,
        limit: limitNumber,
        total,
        pages: Math.ceil(total / limitNumber),
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

export async function getCurrentUser(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const userId = (request as any).user?.id;

    if (!userId) {
      reply.status(401).send({ message: 'Não autorizado', success: false });
      return;
    }

    const usuario = await usuarioService.getUsuarioById(userId);

    if (!usuario) {
      reply.status(404).send({ message: 'Usuário não encontrado', success: false });
      return;
    }

    reply.send({ data: usuario, success: true });
  } catch (error: any) {
    console.error('[getCurrentUser Error]', error);
    reply.status(500).send({
      message: 'Erro ao obter dados do usuário',
      error: error.message,
      success: false,
    });
  }
}

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
