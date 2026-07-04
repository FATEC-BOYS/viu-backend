import { FastifyRequest, FastifyReply } from 'fastify'
import {
  listarChavesPix,
  cadastrarChavePix,
  removerChavePix,
  getSaldoDisponivel,
  solicitarSaque,
  processarSaque,
  listarSaques,
  listarSaquesAdmin,
  listarLedger,
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
    if (error.message.includes('Acesso negado')) {
      reply.status(403).send({ message: error.message, success: false })
      return
    }
    // Prisma P2034: serialization failure from concurrent saque requests
    if (error.code === 'P2034') {
      reply.status(409).send({ message: 'Requisição conflitante. Tente novamente.', success: false })
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

export async function listarSaquesAdminHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    if (usuario.tipo !== 'ADMIN') {
      reply.status(403).send({ message: 'Acesso restrito a administradores', success: false })
      return
    }
    const { status, designerId } = (request.query || {}) as any
    const saques = await listarSaquesAdmin({ status, designerId })
    reply.send({ data: saques, success: true })
  } catch {
    reply.status(500).send({ message: 'Erro ao buscar saques', success: false })
  }
}

export async function processarSaqueHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    if (usuario.tipo !== 'ADMIN') {
      reply.status(403).send({ message: 'Acesso restrito a administradores', success: false })
      return
    }
    const { id } = request.params as { id: string }
    const { status } = request.body as { status: string }
    if (!status) {
      reply.status(400).send({ message: 'status é obrigatório', success: false })
      return
    }
    const saque = await processarSaque(id, status)
    reply.send({ data: saque, success: true })
  } catch (error: any) {
    if (error.message.includes('não encontrado')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    if (error.message.includes('Transição inválida') || error.message.includes('terminal') || error.message.includes('desconhecido')) {
      reply.status(400).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({ message: 'Erro ao processar saque', success: false })
  }
}

export async function listarLedgerHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { designerId } = request.params as { designerId?: string }

    // Non-admins can only see their own ledger
    const targetId = usuario.tipo === 'ADMIN' && designerId ? designerId : usuario.id
    if (usuario.tipo !== 'ADMIN' && designerId && designerId !== usuario.id) {
      reply.status(403).send({ message: 'Acesso negado', success: false })
      return
    }

    const entries = await listarLedger(targetId)
    reply.send({ data: entries, success: true })
  } catch {
    reply.status(500).send({ message: 'Erro ao buscar extrato', success: false })
  }
}
