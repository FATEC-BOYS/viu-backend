// src/controllers/sessaoController.ts
/**
 * Controladores de Sessões
 *
 * Permite listar sessões de um usuário e revogar sessões específicas.
 */

import { FastifyRequest, FastifyReply } from 'fastify'
import { SessaoService, ListSessoesParams } from '../services/sessaoService.js'

const sessaoService = new SessaoService()

export async function listSessoes(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { ativo } = (request.query || {}) as any
    const params: ListSessoesParams = {
      usuarioId: usuario?.id,
      ativo: ativo as any,
    }
    const sessoes = await sessaoService.listSessoes(params)
    reply.send({ data: sessoes, success: true })
  } catch (error: any) {
    reply.status(500).send({
      message: 'Erro ao listar sessões',
      error: error.message,
      success: false,
    })
  }
}

export async function revokeSessao(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { id } = request.params as { id: string }
    const sessao = await sessaoService.getSessaoById(id)
    if (!sessao || sessao.usuarioId !== usuario?.id) {
      reply.status(404).send({ message: 'Sessão não encontrada', success: false })
      return
    }
    const updated = await sessaoService.revokeSessao(id)
    reply.send({ message: 'Sessão revogada com sucesso', data: updated, success: true })
  } catch (error: any) {
    if (error.message.includes('Sessão não encontrada')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({
      message: 'Erro ao revogar sessão',
      error: error.message,
      success: false,
    })
  }
}