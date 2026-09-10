import { FastifyRequest, FastifyReply } from 'fastify'
import { AceiteService } from '../services/aceiteService.js'
import { checkProjectAccess } from '../utils/projectAccess.js'
import { erroInterno } from '../utils/erroInterno.js'

const aceiteService = new AceiteService()

/** Traduz o resultado do helper central para a resposta HTTP desta rota. */
async function assertProjetoParticipant(
  projetoId: string,
  usuarioId: string,
  isAdmin: boolean,
): Promise<{ ok: boolean; status?: number; message?: string }> {
  const resultado = await checkProjectAccess(projetoId, usuarioId, isAdmin)
  if (resultado === 'nao-encontrado') {
    return { ok: false, status: 404, message: 'Projeto não encontrado' }
  }
  if (resultado === 'negado') {
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

    const ip = request.ip ?? request.headers['x-forwarded-for']?.toString().split(',')[0]?.trim()
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
    erroInterno(request, reply, error, 'Erro ao registrar aceite')
  }
}

export async function verificarAceite(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { projetoId } = request.params as { projetoId: string }

    const aceite = await aceiteService.verificarAceite(usuario.id, projetoId)
    reply.send({ data: aceite, aceitou: !!aceite, success: true })
  } catch (erro) {
    request.log.error({ erro }, 'Erro ao verificar aceite')
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
  } catch (erro) {
    request.log.error({ erro }, 'Erro ao listar aceites')
    reply.status(500).send({ message: 'Erro ao listar aceites', success: false })
  }
}
