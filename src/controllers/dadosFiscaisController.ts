import { FastifyRequest, FastifyReply } from 'fastify'
import {
  getDadosFiscais,
  salvarDadosFiscais,
  removerDadosFiscais,
  DadosFiscaisEntrada,
} from '../services/dadosFiscaisService.js'
import { erroInterno } from '../utils/erroInterno.js'

export async function getDadosFiscaisHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const dados = await getDadosFiscais(usuario.id)
    // `null` aqui significa "ainda não preencheu", que é estado legítimo e não
    // 404: a rota existe e respondeu.
    reply.send({ data: dados, success: true })
  } catch (erro) {
    erroInterno(request, reply, erro, 'Erro ao buscar dados fiscais')
  }
}

export async function salvarDadosFiscaisHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const dados = await salvarDadosFiscais(usuario.id, request.body as DadosFiscaisEntrada)
    reply.send({ data: dados, success: true })
  } catch (erro) {
    erroInterno(request, reply, erro, 'Erro ao salvar dados fiscais')
  }
}

export async function removerDadosFiscaisHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    await removerDadosFiscais(usuario.id)
    reply.status(204).send()
  } catch (erro) {
    erroInterno(request, reply, erro, 'Erro ao remover dados fiscais')
  }
}
