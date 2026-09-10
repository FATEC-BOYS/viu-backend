import { FastifyRequest, FastifyReply } from 'fastify'
import { buscaService, BuscaOptions } from '../services/buscaService.js'
import { getAccessibleProjectIds } from '../utils/projectAccess.js'

export async function buscar(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const {
      q,
      tipo,
      status,
      dataInicio,
      dataFim,
      page = 1,
      limit = 10,
    } = (request.query || {}) as any

    if (!q || String(q).trim().length < 2) {
      reply.status(400).send({ message: 'Parâmetro "q" deve ter ao menos 2 caracteres', success: false })
      return
    }

    const query = String(q).trim()
    const opts: BuscaOptions & { tipo?: 'projeto' | 'arte' } = {
      page: Number(page) || 1,
      limit: Math.min(Number(limit) || 10, 50),
      status: status as string | undefined,
      dataInicio: dataInicio as string | undefined,
      dataFim: dataFim as string | undefined,
      tipo: tipo === 'projeto' || tipo === 'arte' ? tipo : undefined,
    }

    // Non-admins only see results from their own projects
    const acessiveis = await getAccessibleProjectIds(usuario.id, usuario.tipo === 'ADMIN')
    if (acessiveis) opts.projetoIds = acessiveis

    const resultado = await buscaService.buscarTudo(query, opts)

    reply.send({
      data: resultado,
      pagination: {
        page: opts.page,
        limit: opts.limit,
        total: resultado.total,
        pages: Math.ceil(resultado.total / (opts.limit ?? 10)),
      },
      success: true,
    })
  } catch (erro) {
    request.log.error({ err: erro }, 'Erro ao executar busca')
    reply.status(500).send({ message: 'Erro ao executar busca', success: false })
  }
}
