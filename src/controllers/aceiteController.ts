import { FastifyRequest, FastifyReply } from 'fastify'
import { AceiteService } from '../services/aceiteService.js'
import prisma from '../database/client.js'

const aceiteService = new AceiteService()

async function assertProjetoParticipant(
  projetoId: string,
  usuarioId: string,
  isAdmin: boolean,
): Promise<{ ok: boolean; status?: number; message?: string }> {
  if (isAdmin) return { ok: true }
  const projeto = await prisma.projeto.findUnique({
    where: { id: projetoId },
    select: { designerId: true, clienteId: true },
  })
  if (!projeto) return { ok: false, status: 404, message: 'Projeto não encontrado' }
  if (projeto.designerId !== usuarioId && projeto.clienteId !== usuarioId) {
    return { ok: false, status: 403, message: 'Acesso negado: você não é parte deste projeto' }
  }
  return { ok: true }
}

export async function registrarAceite(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { projetoId, termoVersao } = request.body as any

    if (!projetoId) {
      reply.status(400).send({ message: 'projetoId é obrigatório', success: false })
      return
    }

    const check = await assertProjetoParticipant(projetoId, usuario.id, usuario.tipo === 'ADMIN')
    if (!check.ok) {
      reply.status(check.status!).send({ message: check.message, success: false })
      return
    }

    const ip = request.ip ?? request.headers['x-forwarded-for']?.toString().split(',')[0].trim()
    const userAgent = request.headers['user-agent']

    const aceite = await aceiteService.registrarAceite({
      usuarioId: usuario.id,
      projetoId,
      termoVersao,
      ip,
      userAgent,
    })

    reply.status(201).send({ data: aceite, success: true })
  } catch (error: any) {
    if (error.message.includes('não encontrado')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({ message: 'Erro ao registrar aceite', success: false })
  }
}

export async function verificarAceite(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { projetoId } = request.params as { projetoId: string }

    const aceite = await aceiteService.verificarAceite(usuario.id, projetoId)
    reply.send({ data: aceite, aceitou: !!aceite, success: true })
  } catch {
    reply.status(500).send({ message: 'Erro ao verificar aceite', success: false })
  }
}

export async function listarAceitesProjeto(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { projetoId } = request.params as { projetoId: string }

    const check = await assertProjetoParticipant(projetoId, usuario.id, usuario.tipo === 'ADMIN')
    if (!check.ok) {
      reply.status(check.status!).send({ message: check.message, success: false })
      return
    }

    const aceites = await aceiteService.listarAceitesPorProjeto(projetoId)
    reply.send({ data: aceites, success: true })
  } catch {
    reply.status(500).send({ message: 'Erro ao listar aceites', success: false })
  }
}
