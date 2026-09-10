import { FastifyRequest, FastifyReply } from 'fastify'
import {
  criarFatura,
  pagarFaturaComPix,
  listarFaturas,
  getFaturaById,
  cancelarFatura,
} from '../services/faturaService.js'
import { erroInterno } from '../utils/erroInterno.js'

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
    /**
     * Regra de negócio não é falha do servidor.
     *
     * Três das quatro razões para recusar uma fatura caíam no 500: "não
     * possui orçamento" e "apenas o designer" não tinham ramo nenhum, e
     * "já existe" só era reconhecida em minúsculo, enquanto a mensagem
     * lançada começa com "Já existe". O resultado é que quem tentava gerar
     * uma fatura sem orçamento — o caso mais comum de quem está começando —
     * recebia um erro genérico, sem nunca descobrir que faltava o valor do
     * projeto.
     *
     * A comparação é sem acento e sem caixa de propósito: casar mensagem por
     * texto é frágil, e o custo de errar aqui é a pessoa levar a culpa por um
     * problema que é do servidor, ou o contrário.
     */
    const motivo = String(error?.message ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()

    const situacao: [RegExp, number][] = [
      [/acesso negado|apenas o designer/, 403],
      [/nao encontrado/, 404],
      [/ja existe/, 409],
      [/nao possui orcamento/, 422],
    ]
    for (const [padrao, status] of situacao) {
      if (padrao.test(motivo)) {
        reply.status(status).send({ message: error.message, success: false })
        return
      }
    }

    erroInterno(request, reply, error, 'Erro ao criar fatura')
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
    if (error.message.includes('já foi paga') || error.message.includes('pagamento pendente') || error.message.includes('pagamento em andamento')) {
      reply.status(409).send({ message: error.message, success: false })
      return
    }
    erroInterno(request, reply, error, 'Erro ao gerar pagamento PIX')
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
  } catch (erro) {
    request.log.error({ err: erro }, 'Erro ao buscar faturas')
    reply.status(500).send({ message: 'Erro ao buscar faturas', success: false })
  }
}

export async function getFaturaHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { id } = request.params as { id: string }
    const fatura = await getFaturaById(id, usuario.id, usuario.tipo === 'ADMIN')
    reply.send({ data: fatura, success: true })
  } catch (error: any) {
    if (error.message === 'Acesso negado') {
      reply.status(403).send({ message: 'Acesso negado', success: false })
      return
    }
    if (error.message.includes('não encontrada')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    erroInterno(request, reply, error, 'Erro ao buscar fatura')
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
    erroInterno(request, reply, error, 'Erro ao cancelar fatura')
  }
}
