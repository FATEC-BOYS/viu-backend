import { FastifyRequest, FastifyReply } from 'fastify'
import {
  criarFatura,
  pagarFaturaComPix,
  listarFaturas,
  getFaturaById,
  cancelarFatura,
} from '../services/faturaService.js'

export async function criarFaturaHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { id: projetoId } = request.params as { id: string }
    const { descricao, dataVencimento } = (request.body || {}) as any
    const fatura = await criarFatura(projetoId, usuario.id, descricao, dataVencimento)
    reply.status(201).send({ message: 'Fatura criada com sucesso', data: fatura, success: true })
  } catch (error: any) {
    if (error.message.includes('Acesso negado')) {
      reply.status(403).send({ message: error.message, success: false })
      return
    }
    if (error.message.includes('não encontrado')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    if (error.message.includes('já existe')) {
      reply.status(409).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({ message: 'Erro ao criar fatura', success: false })
  }
}

export async function pagarFaturaPixHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { id: faturaId } = request.params as { id: string }
    const { cpf } = request.body as { cpf: string }
    const result = await pagarFaturaComPix(faturaId, usuario.id, cpf)
    reply.status(201).send({ data: result, success: true })
  } catch (error: any) {
    if (error.message.includes('não encontrada')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    if (error.message.includes('Acesso negado') || error.message.includes('não pertence')) {
      reply.status(403).send({ message: error.message, success: false })
      return
    }
    if (error.message.includes('já foi paga') || error.message.includes('pagamento pendente')) {
      reply.status(409).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({ message: 'Erro ao gerar pagamento PIX', success: false })
  }
}

export async function listarFaturasHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { tipo = 'cliente' } = (request.query || {}) as any
    const faturas = await listarFaturas(usuario.id, tipo)
    reply.send({ data: faturas, success: true })
  } catch {
    reply.status(500).send({ message: 'Erro ao buscar faturas', success: false })
  }
}

export async function getFaturaHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const { id } = request.params as { id: string }
    const fatura = await getFaturaById(id)
    reply.send({ data: fatura, success: true })
  } catch (error: any) {
    if (error.message.includes('não encontrada')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({ message: 'Erro ao buscar fatura', success: false })
  }
}

export async function cancelarFaturaHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { id } = request.params as { id: string }
    await cancelarFatura(id, usuario.id)
    reply.send({ message: 'Fatura cancelada com sucesso', success: true })
  } catch (error: any) {
    if (error.message.includes('não encontrada')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    if (error.message.includes('Acesso negado')) {
      reply.status(403).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({ message: 'Erro ao cancelar fatura', success: false })
  }
}
