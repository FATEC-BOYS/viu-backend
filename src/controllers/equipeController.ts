import { FastifyRequest, FastifyReply } from 'fastify'
import {
  criarEquipe,
  listarEquipes,
  getEquipe,
  atualizarEquipe,
  deletarEquipe,
  adicionarMembro,
  removerMembro,
  atualizarPapel,
  vincularProjeto,
  desvincularProjeto,
} from '../services/equipeService.js'
import { auditLogService } from '../services/auditLogService.js'
import { erroInterno } from '../utils/erroInterno.js'

function isAdmin(usuario: any) {
  return usuario.tipo === 'ADMIN'
}

export async function criarEquipeHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { nome, slug } = request.body as { nome: string; slug: string }
    const equipe = await criarEquipe(usuario.id, nome, slug)
    reply.status(201).send({ data: equipe, success: true })
  } catch (error: any) {
    if (error.message.includes('Slug já está em uso')) {
      reply.status(409).send({ message: error.message, success: false })
      return
    }
    erroInterno(request, reply, error, 'Erro ao criar equipe')
  }
}

export async function listarEquipesHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const equipes = await listarEquipes(usuario.id)
    reply.send({ data: equipes, success: true })
  } catch (erro) {
    request.log.error({ erro }, 'Erro ao listar equipes')
    reply.status(500).send({ message: 'Erro ao listar equipes', success: false })
  }
}

export async function getEquipeHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { id } = request.params as { id: string }
    const equipe = await getEquipe(id, usuario.id, isAdmin(usuario))
    if (!equipe) {
      reply.status(404).send({ message: 'Equipe não encontrada', success: false })
      return
    }
    reply.send({ data: equipe, success: true })
  } catch (error: any) {
    if (error.message.includes('Acesso negado')) {
      reply.status(403).send({ message: error.message, success: false })
      return
    }
    erroInterno(request, reply, error, 'Erro ao buscar equipe')
  }
}

export async function atualizarEquipeHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { id } = request.params as { id: string }
    const { nome, slug } = request.body as { nome?: string; slug?: string }
    const equipe = await atualizarEquipe(id, { nome, slug }, usuario.id, isAdmin(usuario))
    reply.send({ data: equipe, success: true })
  } catch (error: any) {
    if (error.message.includes('não encontrada')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    if (error.message.includes('Apenas líderes') || error.message.includes('Acesso negado')) {
      reply.status(403).send({ message: error.message, success: false })
      return
    }
    if (error.message.includes('Slug já está em uso')) {
      reply.status(409).send({ message: error.message, success: false })
      return
    }
    erroInterno(request, reply, error, 'Erro ao atualizar equipe')
  }
}

export async function deletarEquipeHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { id } = request.params as { id: string }
    await deletarEquipe(id, usuario.id, isAdmin(usuario))
    reply.send({ message: 'Equipe excluída com sucesso', success: true })
  } catch (error: any) {
    if (error.message.includes('não encontrada')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    if (error.message.includes('Apenas o dono')) {
      reply.status(403).send({ message: error.message, success: false })
      return
    }
    erroInterno(request, reply, error, 'Erro ao excluir equipe')
  }
}

export async function adicionarMembroHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { id } = request.params as { id: string }
    const { usuarioId, papel } = request.body as { usuarioId: string; papel: string }
    const membro = await adicionarMembro(id, usuarioId, papel, usuario.id, isAdmin(usuario))
    reply.status(201).send({ data: membro, success: true })
  } catch (error: any) {
    if (error.message.includes('não encontrada') || error.message.includes('não encontrado')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    if (error.message.includes('Apenas líderes')) {
      reply.status(403).send({ message: error.message, success: false })
      return
    }
    if (error.message.includes('já é membro') || error.message.includes('Papel inválido')) {
      reply.status(400).send({ message: error.message, success: false })
      return
    }
    erroInterno(request, reply, error, 'Erro ao adicionar membro')
  }
}

export async function removerMembroHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { id, usuarioId } = request.params as { id: string; usuarioId: string }
    await removerMembro(id, usuarioId, usuario.id, isAdmin(usuario))
    reply.send({ message: 'Membro removido com sucesso', success: true })
  } catch (error: any) {
    if (error.message.includes('não encontrad')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    if (error.message.includes('Apenas líderes') || error.message.includes('dono da equipe')) {
      reply.status(403).send({ message: error.message, success: false })
      return
    }
    erroInterno(request, reply, error, 'Erro ao remover membro')
  }
}

export async function atualizarPapelHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { id, usuarioId } = request.params as { id: string; usuarioId: string }
    const { papel } = request.body as { papel: string }
    const membro = await atualizarPapel(id, usuarioId, papel, usuario.id, isAdmin(usuario))

    auditLogService.logSuccess('PAPEL_ALTERADO', 'Equipe', {
      resourceId: id,
      usuarioId: usuario.id,
      ipAddress: request.ip,
      details: { membroId: usuarioId, novoPapel: papel },
    }).catch(() => {})

    reply.send({ data: membro, success: true })
  } catch (error: any) {
    if (error.message.includes('não encontrad')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    if (error.message.includes('Apenas líderes') || error.message.includes('dono da equipe')) {
      reply.status(403).send({ message: error.message, success: false })
      return
    }
    if (error.message.includes('Papel inválido')) {
      reply.status(400).send({ message: error.message, success: false })
      return
    }
    erroInterno(request, reply, error, 'Erro ao atualizar papel')
  }
}

export async function vincularProjetoHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { id } = request.params as { id: string }
    const { projetoId } = request.body as { projetoId: string }
    const projeto = await vincularProjeto(id, projetoId, usuario.id, isAdmin(usuario))
    reply.send({ data: projeto, success: true })
  } catch (error: any) {
    if (error.message.includes('não encontrad')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    if (error.message.includes('Apenas líderes') || error.message.includes('não tem permissão')) {
      reply.status(403).send({ message: error.message, success: false })
      return
    }
    erroInterno(request, reply, error, 'Erro ao vincular projeto')
  }
}

export async function desvincularProjetoHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { id, projetoId } = request.params as { id: string; projetoId: string }
    await desvincularProjeto(id, projetoId, usuario.id, isAdmin(usuario))
    reply.send({ message: 'Projeto desvinculado com sucesso', success: true })
  } catch (error: any) {
    if (error.message.includes('não encontrad') || error.message.includes('não pertence')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    if (error.message.includes('não tem permissão')) {
      reply.status(403).send({ message: error.message, success: false })
      return
    }
    erroInterno(request, reply, error, 'Erro ao desvincular projeto')
  }
}
