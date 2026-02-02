// src/controllers/linkController.ts
/**
 * Controladores de Links Compartilhados
 *
 * Gerencia a criação de links compartilhados para artes e o acesso
 * público via token (preview sem necessidade de autenticação).
 */

import { FastifyRequest, FastifyReply } from 'fastify'
import { LinkService } from '../services/linkService.js'

const linkService = new LinkService()

export async function createSharedLink(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    if (!usuario?.id) {
      reply.status(401).send({ message: 'Usuário não autenticado', success: false })
      return
    }

    const data = request.body as {
      arteId: string
      expiraEm?: string
      somenteLeitura?: boolean
    }

    const link = await linkService.createSharedLink({
      arteId: data.arteId,
      expiraEm: data.expiraEm,
      somenteLeitura: data.somenteLeitura ?? true,
    })

    const appUrl = process.env.APP_URL || 'http://localhost:3001'
    const url = `${appUrl}/preview/${link.token}`

    reply.status(201).send({
      message: 'Link compartilhado criado com sucesso',
      data: { url, token: link.token },
      success: true,
    })
  } catch (error: any) {
    if (error.message.includes('não encontrad')) {
      reply.status(400).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({
      message: 'Erro ao criar link compartilhado',
      error: error.message,
      success: false,
    })
  }
}

export async function getPreviewByToken(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const { token } = request.params as { token: string }

    const preview = await linkService.getPreviewByToken(token)

    reply.send({
      data: preview,
      success: true,
    })
  } catch (error: any) {
    if (error.message.includes('inválido')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    if (error.message.includes('expirado')) {
      reply.status(410).send({ message: error.message, success: false })
      return
    }
    if (error.message.includes('não encontrad')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({
      message: 'Erro ao buscar preview',
      error: error.message,
      success: false,
    })
  }
}
