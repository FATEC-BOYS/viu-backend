import { FastifyRequest, FastifyReply } from 'fastify'
import { LinkService } from '../services/linkService.js'
import { env } from '../config/env.js'

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

    const url = `${env.FRONTEND_URL}/viewer/${link.token}`

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
    reply.status(500).send({ message: 'Erro ao criar link compartilhado', success: false })
  }
}

export async function getPreviewByToken(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const { token } = request.params as { token: string }
    const preview = await linkService.getPreviewByToken(token)
    reply.send({ data: preview, success: true })
  } catch (error: any) {
    if (
      error.message.includes('inválido') ||
      error.message.includes('expirado') ||
      error.message.includes('não encontrad')
    ) {
      reply.status(404).send({ message: 'Link não encontrado', success: false })
      return
    }
    reply.status(500).send({ message: 'Erro ao buscar preview', success: false })
  }
}

export async function createGuestFeedback(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const { token } = request.params as { token: string }
    const body = request.body as {
      guestNome?: string
      guestEmail?: string
      conteudo: string
      tipo?: string
      arquivo?: string
      posicaoX?: number
      posicaoY?: number
    }

    const feedback = await linkService.createGuestFeedback({
      token,
      guestNome: body.guestNome,
      guestEmail: body.guestEmail,
      conteudo: body.conteudo ?? '',
      tipo: body.tipo ?? 'TEXTO',
      arquivo: body.arquivo,
      posicaoX: body.posicaoX,
      posicaoY: body.posicaoY,
    })

    reply.status(201).send({ data: feedback, success: true })
  } catch (error: any) {
    if (error.message.includes('inválido') || error.message.includes('expirado')) {
      reply.status(404).send({ message: 'Link não encontrado', success: false })
      return
    }
    if (error.message.includes('não permite')) {
      reply.status(403).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({ message: 'Erro ao criar feedback', success: false })
  }
}
