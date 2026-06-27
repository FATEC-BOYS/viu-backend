import { FastifyRequest, FastifyReply } from 'fastify'
import { UsuarioService, ListUsuariosParams } from '../services/usuarioService.js'
import { sendVerificationEmail } from '../services/emailVerificationService.js'
import { uploadFile, signPath } from '../utils/storage.js'

const usuarioService = new UsuarioService()

export async function listUsuarios(request: FastifyRequest, reply: FastifyReply): Promise<void> {
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
      pagination: { page: params.page, limit: params.limit, total, pages: Math.ceil(total / params.limit!) },
      success: true,
    })
  } catch {
    reply.status(500).send({ message: 'Erro ao buscar usuários', success: false })
  }
}

export async function getUsuarioById(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const { id } = request.params as { id: string }
    const usuario = await usuarioService.getUsuarioById(id)
    if (!usuario) {
      reply.status(404).send({ message: 'Usuário não encontrado', success: false })
      return
    }
    reply.send({ data: usuario, success: true })
  } catch {
    reply.status(500).send({ message: 'Erro ao buscar usuário', success: false })
  }
}

export async function createUsuario(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = await usuarioService.createUsuario(request.body)

    // Fire-and-forget — não bloqueia o registro se o email falhar
    sendVerificationEmail(usuario.id, usuario.email).catch(() => {})

    reply.status(201).send({ message: 'Usuário criado com sucesso. Verifique seu e-mail para ativar a conta.', data: usuario, success: true })
  } catch (error: any) {
    if (error.message.includes('Email já está em uso')) {
      reply.status(400).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({ message: 'Erro ao criar usuário', success: false })
  }
}

export async function updateUsuario(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const { id } = request.params as { id: string }
    const usuario = await usuarioService.updateUsuario(id, request.body)
    reply.send({ message: 'Usuário atualizado com sucesso', data: usuario, success: true })
  } catch (error: any) {
    if (error.message.includes('Usuário não encontrado')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    if (error.message.includes('Email já está em uso')) {
      reply.status(400).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({ message: 'Erro ao atualizar usuário', success: false })
  }
}

export async function deactivateUsuario(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const { id } = request.params as { id: string }
    await usuarioService.deactivateUsuario(id)
    reply.send({ message: 'Usuário desativado com sucesso', success: true })
  } catch (error: any) {
    if (error.message.includes('Usuário não encontrado')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({ message: 'Erro ao desativar usuário', success: false })
  }
}

export async function loginUsuario(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const resultado = await usuarioService.login(request.body)
    reply.send({ message: 'Login realizado com sucesso', data: resultado, success: true })
  } catch (error: any) {
    if (error.message.includes('Email ou senha inválidos') || error.message.includes('inativo')) {
      reply.status(401).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({ message: 'Erro no login', success: false })
  }
}

export async function getCurrentUser(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    // Corrigido: era (request as any).user, deve ser .usuario (definido pelo authMiddleware)
    const userId = (request as any).usuario?.id
    if (!userId) {
      reply.status(401).send({ message: 'Não autorizado', success: false })
      return
    }
    const usuario = await usuarioService.getUsuarioById(userId)
    if (!usuario) {
      reply.status(404).send({ message: 'Usuário não encontrado', success: false })
      return
    }
    reply.send({ data: usuario, success: true })
  } catch {
    reply.status(500).send({ message: 'Erro ao obter dados do usuário', success: false })
  }
}

export async function uploadAvatar(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { id } = request.params as { id: string }

    if (usuario?.id !== id) {
      reply.status(403).send({ message: 'Não autorizado', success: false })
      return
    }

    const fileData = (request as any).fileData
    if (!fileData) {
      reply.status(400).send({ message: 'Nenhum arquivo fornecido', success: false })
      return
    }

    if (!fileData.mimetype.startsWith('image/')) {
      reply.status(400).send({ message: 'Apenas imagens são permitidas para avatar', success: false })
      return
    }

    const key = `avatars/${id}/${Date.now()}_${fileData.filename}`
    await uploadFile(key, fileData.buffer, fileData.mimetype)

    const updated = await usuarioService.updateUsuario(id, { avatar: key })
    const avatarUrl = await signPath(key, 3600 * 24)

    reply.send({
      message: 'Avatar atualizado com sucesso',
      data: { ...updated, avatar: avatarUrl },
      success: true,
    })
  } catch {
    reply.status(500).send({ message: 'Erro ao fazer upload do avatar', success: false })
  }
}

export async function statsOverview(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const data = await usuarioService.statsOverview()
    reply.send({ data, success: true })
  } catch {
    reply.status(500).send({ message: 'Erro ao buscar estatísticas', success: false })
  }
}
