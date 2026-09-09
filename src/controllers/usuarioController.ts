import { FastifyRequest, FastifyReply } from 'fastify'
import { UsuarioService, ListUsuariosParams } from '../services/usuarioService.js'
import { sendVerificationEmail } from '../services/emailVerificationService.js'
import { uploadFile, signPath } from '../utils/storage.js'
import { auditLogService } from '../services/auditLogService.js'
import { definirCookiesDeSessao } from '../utils/authCookies.js'

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
  } catch (erro) {
    request.log.error({ erro }, 'Erro ao buscar usuários')
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
  } catch (erro) {
    request.log.error({ erro }, 'Erro ao buscar usuário')
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
    request.log.error({ erro: error }, 'Falha inesperada ao criar usuário')
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
    const actor = (request as any).usuario
    await usuarioService.deactivateUsuario(id)

    // LGPD: registra anonimização com IP e user-agent do solicitante
    auditLogService.logSuccess('LGPD_ANONIMIZAR', 'Usuario', {
      resourceId: id,
      usuarioId: actor?.id,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
      details: { solicitadoPor: actor?.id, solicitadoParaId: id },
    }).catch(() => {})

    reply.send({ message: 'Conta removida e dados anonimizados', success: true })
  } catch (error: any) {
    if (error.message.includes('Usuário não encontrado')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({ message: 'Erro ao remover conta', success: false })
  }
}

export async function loginUsuario(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const resultado = await usuarioService.login(request.body)

    // Conta com 2FA ainda não tem sessão: o login só se completa em
    // POST /auth/2fa/login.
    if ((resultado as any).requires2FA) {
      reply.send({ message: 'Verificação de 2FA necessária', data: resultado, success: true })
      return
    }

    const { token, refreshToken, expiresAt, refreshExpiresAt, usuario } = resultado as any
    definirCookiesDeSessao(reply, { token, refreshToken }, { expiresAt, refreshExpiresAt })

    // O token não volta no corpo: se voltasse, qualquer XSS poderia lê-lo da
    // resposta e guardar um bearer que sobrevive à sessão do navegador — que é
    // exatamente o que sair do localStorage veio resolver.
    reply.send({ message: 'Login realizado com sucesso', data: { usuario }, success: true })
  } catch (error: any) {
    if (error.message.includes('Email ou senha inválidos') || error.message.includes('inativo')) {
      reply.status(401).send({ message: error.message, success: false })
      return
    }
    // Sem este log, um 500 aqui vira "Erro no login" na tela e mais nada em
    // lugar nenhum — nem no servidor. Já custou uma sessão inteira de
    // adivinhação em produção: dava para ver a requisição falhando e não o
    // motivo. A mensagem ao usuário continua genérica de propósito; quem
    // precisa do detalhe é quem lê o log.
    request.log.error({ erro: error }, 'Falha inesperada no login')
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
  } catch (erro) {
    request.log.error({ erro }, 'Erro ao obter dados do usuário')
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
  } catch (erro) {
    request.log.error({ erro }, 'Erro ao fazer upload do avatar')
    reply.status(500).send({ message: 'Erro ao fazer upload do avatar', success: false })
  }
}

export async function buscarUsuarios(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const { q, limit = 5 } = (request.query || {}) as { q?: string; limit?: number }
    if (!q || q.trim().length < 3) {
      return reply.status(400).send({ message: 'Parâmetro "q" deve ter ao menos 3 caracteres', success: false })
    }
    const data = await usuarioService.buscarUsuarios(q, Number(limit))
    reply.send({ data, success: true })
  } catch (erro) {
    request.log.error({ erro }, 'Erro ao buscar usuários')
    reply.status(500).send({ message: 'Erro ao buscar usuários', success: false })
  }
}

export async function statsOverview(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const data = await usuarioService.statsOverview()
    reply.send({ data, success: true })
  } catch (erro) {
    request.log.error({ erro }, 'Erro ao buscar estatísticas')
    reply.status(500).send({ message: 'Erro ao buscar estatísticas', success: false })
  }
}
