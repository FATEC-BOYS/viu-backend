import { FastifyRequest, FastifyReply } from 'fastify'
import { AprovacaoService, ListAprovacoesParams } from '../services/aprovacaoService.js'
import { getAccessibleProjectIds } from '../utils/projectAccess.js'
import { erroInterno } from '../utils/erroInterno.js'

const aprovacaoService = new AprovacaoService()

export async function listAprovacoes(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { page = 1, limit = 10, arteId, aprovadorId, status, projetoId } = (request.query || {}) as any
    const params: ListAprovacoesParams = {
      page: Number(page) || 1,
      limit: Number(limit) || 10,
      arteId: arteId as string | undefined,
      aprovadorId: aprovadorId as string | undefined,
      status: status as string | undefined,
      projetoId: projetoId as string | undefined,
    }

    const acessiveis = await getAccessibleProjectIds(usuario.id, usuario.tipo === 'ADMIN')
    if (acessiveis) params.projetoIds = acessiveis

    const { aprovacoes, total } = await aprovacaoService.listAprovacoes(params)
    reply.send({
      data: aprovacoes,
      pagination: { page: params.page, limit: params.limit, total, pages: Math.ceil(total / params.limit!) },
      success: true,
    })
  } catch (erro) {
    request.log.error({ erro }, 'Erro ao listar aprovações')
    reply.status(500).send({ message: 'Erro ao listar aprovações', success: false })
  }
}

export async function getAprovacaoById(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { id } = request.params as { id: string }
    const aprovacao = await aprovacaoService.getAprovacaoById(id, usuario.id, usuario.tipo === 'ADMIN')
    if (!aprovacao) {
      reply.status(404).send({ message: 'Aprovação não encontrada', success: false })
      return
    }
    reply.send({ data: aprovacao, success: true })
  } catch (error: any) {
    if (error.message === 'Acesso negado') {
      reply.status(403).send({ message: 'Acesso negado', success: false })
      return
    }
    erroInterno(request, reply, error, 'Erro ao buscar aprovação')
  }
}

export async function createAprovacao(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const body = request.body as any
    const data = {
      arteId: body.arteId,
      status: body.status ?? 'PENDENTE',
      comentario: body.comentario,
      aprovadorId: usuario.id, // always set from authenticated user, never from body
    }
    const aprovacao = await aprovacaoService.createAprovacao(data)
    reply.status(201).send({ message: 'Aprovação criada com sucesso', data: aprovacao, success: true })
  } catch (error: any) {
    if (
      error.message.includes('não encontrad') ||
      error.message.includes('Apenas o cliente') ||
      error.message.includes('O autor não pode')
    ) {
      reply.status(403).send({ message: error.message, success: false })
      return
    }
    erroInterno(request, reply, error, 'Erro ao criar aprovação')
  }
}

export async function solicitarAprovacaoHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { id } = request.params as { id: string }
    const { versaoNumero } = (request.body ?? {}) as { versaoNumero?: number }

    const aprovacao = await aprovacaoService.solicitarAprovacao(id, usuario.id, versaoNumero)
    reply.status(201).send({ message: 'Aprovação solicitada', data: aprovacao, success: true })
  } catch (error: any) {
    if (error.message.includes('nao encontrad') || error.message.includes('encontrad')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    if (error.message.includes('Acesso negado')) {
      reply.status(403).send({ message: error.message, success: false })
      return
    }
    erroInterno(request, reply, error, 'Erro ao solicitar aprovação')
  }
}

export async function updateAprovacao(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { id } = request.params as { id: string }
    const body = request.body as any
    const aprovacao = await aprovacaoService.updateAprovacao(id, body, usuario.id)
    reply.send({ message: 'Aprovação atualizada com sucesso', data: aprovacao, success: true })
  } catch (error: any) {
    // Transição barrada pela máquina de estados é erro de quem chamou, não do
    // servidor — devolvia 500 e mascarava a causa.
    if (error.message.includes('é terminal') || error.message.includes('Transição inválida')) {
      reply.status(409).send({ message: error.message, success: false })
      return
    }
    if (error.message.includes('Aprovação não encontrada')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    if (error.message.includes('Acesso negado')) {
      reply.status(403).send({ message: error.message, success: false })
      return
    }
    erroInterno(request, reply, error, 'Erro ao atualizar aprovação')
  }
}

export async function deleteAprovacao(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { id } = request.params as { id: string }
    await aprovacaoService.deleteAprovacao(id, usuario.id, usuario.tipo === 'ADMIN')
    reply.send({ message: 'Aprovação removida com sucesso', success: true })
  } catch (error: any) {
    if (error.message.includes('Aprovação não encontrada')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    if (error.message.includes('Acesso negado')) {
      reply.status(403).send({ message: error.message, success: false })
      return
    }
    erroInterno(request, reply, error, 'Erro ao remover aprovação')
  }
}

export async function lembrarAprovadorHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { id } = request.params as { id: string }
    const data = await aprovacaoService.lembrarAprovador(id, usuario.id)
    reply.send({ message: 'Lembrete enviado', data, success: true })
  } catch (error: any) {
    if (error.message === 'Aprovação não encontrada') {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    if (error.message === 'Acesso negado') {
      reply.status(403).send({ message: error.message, success: false })
      return
    }
    if (error.message === 'Aprovação já respondida') {
      reply.status(409).send({ message: error.message, success: false })
      return
    }
    request.log.error(error)
    reply.status(500).send({ message: 'Erro ao enviar lembrete', success: false })
  }
}
