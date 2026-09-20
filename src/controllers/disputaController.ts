import { FastifyRequest, FastifyReply } from 'fastify'
import { DisputaService, DisputaTipo } from '../services/disputaService.js'
import { erroInterno } from '../utils/erroInterno.js'

const disputaService = new DisputaService()

export async function abrirDisputa(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { tipo, descricao, projetoId, faturaId } = request.body as any

    if (!tipo || !descricao || !projetoId) {
      reply.status(400).send({ message: 'tipo, descricao e projetoId são obrigatórios', success: false })
      return
    }

    const disputa = await disputaService.abrirDisputa({
      tipo: tipo as DisputaTipo,
      descricao,
      abertaPorId: usuario.id,
      projetoId,
      faturaId,
    })

    reply.status(201).send({ data: disputa, success: true })
  } catch (error: any) {
    if (error.message.includes('Acesso negado')) {
      reply.status(403).send({ message: error.message, success: false })
      return
    }
    /*
     * Conflito de estado, não erro de quem clicou: a fatura já está em disputa.
     * Cair no 500 genérico daria "erro interno" para uma recusa que a pessoa
     * consegue entender e resolver escolhendo outra fatura.
     */
    if (error.message.includes('Já existe uma disputa em aberto')) {
      reply.status(409).send({ message: error.message, success: false })
      return
    }
    if (error.message.includes('não encontrado') || error.message.includes('não encontrada') || error.message.includes('inválido') || error.message.includes('não pertence')) {
      reply.status(400).send({ message: error.message, success: false })
      return
    }
    erroInterno(request, reply, error, 'Erro ao abrir disputa')
  }
}

export async function listarDisputas(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { projetoId, status } = (request.query || {}) as any

    const filtros = {
      projetoId: projetoId as string | undefined,
      status: status as string | undefined,
      // Non-admins see disputes they opened OR that were opened against them
      ...(usuario.tipo !== 'ADMIN' ? { participanteId: usuario.id } : {}),
    }

    const disputas = await disputaService.listarDisputas(filtros)
    reply.send({ data: disputas, success: true })
  } catch (erro) {
    request.log.error({ err: erro }, 'Erro ao listar disputas')
    reply.status(500).send({ message: 'Erro ao listar disputas', success: false })
  }
}

export async function getDisputaById(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { id } = request.params as { id: string }

    const disputa = await disputaService.getDisputa(id)
    if (!disputa) {
      reply.status(404).send({ message: 'Disputa não encontrada', success: false })
      return
    }

    // Only admin or the opener can see the dispute
    if (usuario.tipo !== 'ADMIN' && disputa.abertaPorId !== usuario.id) {
      reply.status(403).send({ message: 'Acesso negado', success: false })
      return
    }

    reply.send({ data: disputa, success: true })
  } catch (erro) {
    request.log.error({ err: erro }, 'Erro ao buscar disputa')
    reply.status(500).send({ message: 'Erro ao buscar disputa', success: false })
  }
}

export async function resolverDisputa(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    if (usuario.tipo !== 'ADMIN') {
      reply.status(403).send({ message: 'Apenas administradores podem resolver disputas', success: false })
      return
    }

    const { id } = request.params as { id: string }
    const { resolucao, status } = request.body as any

    if (!resolucao || !status) {
      reply.status(400).send({ message: 'resolucao e status são obrigatórios', success: false })
      return
    }

    const disputa = await disputaService.resolverDisputa(id, { resolucao, status })
    reply.send({ data: disputa, success: true })
  } catch (error: any) {
    /*
     * O estorno é parte de resolver a favor do cliente, então as recusas dele
     * chegam aqui. Separadas por quem precisa agir:
     *
     *  - 502: o Mercado Pago recusou. A disputa continua em aberto e quem
     *    arbitrou pode tentar de novo — devolver 500 esconderia justamente o
     *    motivo que diz se adianta tentar.
     *  - 409: não há o que estornar (fatura cancelada, ou nunca paga). É
     *    conflito de estado, não erro de quem clicou.
     */
    if (error.message.includes('recusou o estorno')) {
      reply.status(502).send({ message: error.message, success: false })
      return
    }
    if (error.message.includes('Não há o que estornar')) {
      reply.status(409).send({ message: error.message, success: false })
      return
    }
    if (error.message.includes('não encontrada') || error.message.includes('inválido') || error.message.includes('já foi resolvida')) {
      reply.status(400).send({ message: error.message, success: false })
      return
    }
    erroInterno(request, reply, error, 'Erro ao resolver disputa')
  }
}

export async function moverParaAnalise(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    if (usuario.tipo !== 'ADMIN') {
      reply.status(403).send({ message: 'Acesso negado', success: false })
      return
    }
    const { id } = request.params as { id: string }
    const disputa = await disputaService.moverParaAnalise(id)
    reply.send({ data: disputa, success: true })
  } catch (erro) {
    request.log.error({ err: erro }, 'Erro ao atualizar disputa')
    reply.status(500).send({ message: 'Erro ao atualizar disputa', success: false })
  }
}
