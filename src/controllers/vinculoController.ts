import { FastifyRequest, FastifyReply } from 'fastify'
import { vinculoService } from '../services/vinculoService.js'

export async function listVinculosRompidos(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const data = await vinculoService.listRompidos(usuario.id)
    reply.send({ data, success: true })
  } catch (error) {
    request.log.error(error)
    reply.status(500).send({ message: 'Erro ao listar vínculos', success: false })
  }
}

export async function romperVinculo(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { clienteId } = request.params as { clienteId: string }
    const data = await vinculoService.romper(usuario.id, clienteId)
    reply.send({ message: 'Vínculo rompido', data, success: true })
  } catch (error: any) {
    if (error.message === 'Vínculo não encontrado') {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    if (error.message?.includes('consigo mesmo')) {
      reply.status(400).send({ message: error.message, success: false })
      return
    }
    request.log.error(error)
    reply.status(500).send({ message: 'Erro ao romper vínculo', success: false })
  }
}

export async function restaurarVinculo(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { clienteId } = request.params as { clienteId: string }
    const data = await vinculoService.restaurar(usuario.id, clienteId)
    reply.send({ message: 'Vínculo restaurado', data, success: true })
  } catch (error: any) {
    if (error.message === 'Vínculo não está rompido') {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    request.log.error(error)
    reply.status(500).send({ message: 'Erro ao restaurar vínculo', success: false })
  }
}
