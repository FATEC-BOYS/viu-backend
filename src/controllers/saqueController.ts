import { FastifyRequest, FastifyReply } from 'fastify'
import {
  listarChavesPix,
  cadastrarChavePix,
  removerChavePix,
  getSaldoDisponivel,
  solicitarSaque,
  listarSaques,
} from '../services/saqueService.js'

export async function listarChavesPixHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const chaves = await listarChavesPix(usuario.id)
    reply.send({ data: chaves, success: true })
  } catch {
    reply.status(500).send({ message: 'Erro ao buscar chaves PIX', success: false })
  }
}

export async function cadastrarChavePixHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { tipo, chave, titular } = request.body as { tipo: string; chave: string; titular: string }
    const chavePix = await cadastrarChavePix(usuario.id, { tipo, chave, titular })
    reply.status(201).send({ message: 'Chave PIX cadastrada com sucesso', data: chavePix, success: true })
  } catch (error: any) {
    if (error.message.includes('Tipo de chave')) {
      reply.status(400).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({ message: 'Erro ao cadastrar chave PIX', success: false })
  }
}

export async function removerChavePixHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { id } = request.params as { id: string }
    await removerChavePix(id, usuario.id)
    reply.send({ message: 'Chave PIX removida com sucesso', success: true })
  } catch (error: any) {
    if (error.message.includes('não encontrada') || error.message.includes('não pertence')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({ message: 'Erro ao remover chave PIX', success: false })
  }
}

export async function getSaldoHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const saldo = await getSaldoDisponivel(usuario.id)
    reply.send({ data: saldo, success: true })
  } catch {
    reply.status(500).send({ message: 'Erro ao buscar saldo', success: false })
  }
}

export async function solicitarSaqueHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { chavePixId, valor } = request.body as { chavePixId: string; valor: number }
    const saque = await solicitarSaque(usuario.id, chavePixId, valor)
    reply.status(201).send({ message: 'Saque solicitado com sucesso', data: saque, success: true })
  } catch (error: any) {
    if (
      error.message.includes('Valor mínimo') ||
      error.message.includes('Saldo insuficiente') ||
      error.message.includes('não encontrada')
    ) {
      reply.status(400).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({ message: 'Erro ao solicitar saque', success: false })
  }
}

export async function listarSaquesHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const saques = await listarSaques(usuario.id)
    reply.send({ data: saques, success: true })
  } catch {
    reply.status(500).send({ message: 'Erro ao buscar saques', success: false })
  }
}
