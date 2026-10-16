import { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import prisma from '../database/client.js'
import { LinkService, LinkIndisponivelError } from '../services/linkService.js'
import { assertAcessoAoProjeto, PROJETO_ACCESS_SELECT } from '../utils/projectAccess.js'
import { sugerirAjustes } from '../services/ajustesService.js'

const Entrada = z.object({ arteId: z.string().min(1), versaoNumero: z.number().int().positive(), texto: z.string().trim().min(1).max(10000) })

/** Sugestão sem persistência; só a confirmação normal cria o comentário. */
export async function criarSugestaoAjustes(request: FastifyRequest, reply: FastifyReply) {
  const entrada = Entrada.safeParse(request.body)
  if (!entrada.success) return reply.status(400).send({ success: false, message: 'Informe a arte, versão e um comentário de até 10 mil caracteres.' })
  const { token } = request.params as { token?: string }
  const usuario = (request as any).usuario
  try {
    const arteId = token ? await new LinkService().resolveArteIdFromToken(token) : entrada.data.arteId
    if (arteId !== entrada.data.arteId) return reply.status(403).send({ success: false, message: 'A arte não pertence a este link.' })
    const arte = await prisma.arte.findUnique({ where: { id: arteId }, include: { projeto: { select: PROJETO_ACCESS_SELECT } } })
    if (!arte) return reply.status(404).send({ success: false, message: 'Arte não encontrada.' })
    if (!token) assertAcessoAoProjeto(arte.projeto, usuario.id, usuario.tipo === 'ADMIN')
    if (arte.versao !== entrada.data.versaoNumero) return reply.status(409).send({ success: false, message: 'A versão mudou. Reabra a arte atual.' })
    try {
      const data = await sugerirAjustes(entrada.data.texto)
      return reply.send({ success: true, data })
    } catch {
      request.log.warn('Sugestão de ajustes indisponível')
      return reply.status(503).send({ success: false, message: 'Não foi possível sugerir ajustes. Seu comentário continua disponível.' })
    }
  } catch (erro) {
    if (erro instanceof LinkIndisponivelError) return reply.status(410).send({ success: false, message: erro.message })
    if (erro instanceof Error && (erro.message === 'somenteLeitura' || erro.message.startsWith('Acesso negado'))) return reply.status(403).send({ success: false, message: 'Você não pode comentar nesta arte.' })
    request.log.error({ err: erro }, 'Erro ao preparar sugestões')
    return reply.status(500).send({ success: false, message: 'Não foi possível preparar sugestões.' })
  }
}
