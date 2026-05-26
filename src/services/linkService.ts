import { prisma } from '../database/client.js'
import { signPath } from '../utils/supabaseStorage.js'
import crypto from 'crypto'

export class LinkService {
  private generateToken(length = 24): string {
    return crypto.randomBytes(length).toString('hex')
  }

  async createSharedLink(data: {
    arteId: string
    expiraEm?: string
    somenteLeitura: boolean
  }) {
    const arte = await prisma.arte.findUnique({ where: { id: data.arteId } })
    if (!arte) throw new Error('Arte não encontrada')

    const token = this.generateToken()
    const link = await prisma.linkCompartilhado.create({
      data: {
        token,
        tipo: 'ARTE',
        arteId: data.arteId,
        expiraEm: data.expiraEm ? new Date(data.expiraEm) : null,
        somenteLeitura: data.somenteLeitura,
      },
    })
    return link
  }

  async getPreviewByToken(token: string) {
    const link = await prisma.linkCompartilhado.findUnique({ where: { token } })
    if (!link) throw new Error('Link inválido')

    if (link.expiraEm && new Date(link.expiraEm) < new Date()) {
      throw new Error('Link inválido')
    }

    if (link.tipo !== 'ARTE' || !link.arteId) {
      throw new Error('Tipo de link não suportado')
    }

    const arte = await prisma.arte.findUnique({
      where: { id: link.arteId },
      include: {
        projeto: { select: { nome: true } },
        autor: { select: { nome: true, email: true } },
      },
    })
    if (!arte) throw new Error('Arte não encontrada')

    const arquivo_url = await signPath(arte.arquivo)

    const feedbacks = await prisma.feedback.findMany({
      where: { arteId: arte.id },
      orderBy: { criadoEm: 'asc' },
      include: { autor: { select: { nome: true, email: true } } },
    })

    const feedbacksComUrl = await Promise.all(
      feedbacks.map(async (fb) => ({
        ...fb,
        arquivo_url: fb.tipo === 'AUDIO' && fb.arquivo ? await signPath(fb.arquivo) : null,
      })),
    )

    return {
      somenteLeitura: link.somenteLeitura,
      canComment: link.canComment,
      arte: { ...arte, arquivo_url },
      feedbacks: feedbacksComUrl,
    }
  }

  async createGuestFeedback(data: {
    token: string
    guestNome?: string
    guestEmail?: string
    conteudo: string
    tipo: string
    arquivo?: string
    posicaoX?: number
    posicaoY?: number
  }) {
    const link = await prisma.linkCompartilhado.findUnique({ where: { token: data.token } })
    if (!link) throw new Error('Link inválido')
    if (link.expiraEm && new Date(link.expiraEm) < new Date()) throw new Error('Link inválido')
    if (link.somenteLeitura || !link.canComment) {
      throw new Error('Este link não permite comentários')
    }
    if (!link.arteId) throw new Error('Link inválido')

    const feedback = await prisma.feedback.create({
      data: {
        conteudo: data.conteudo ?? '',
        tipo: data.tipo ?? 'TEXTO',
        arquivo: data.arquivo ?? null,
        arteId: link.arteId,
        posicaoX: data.posicaoX ?? null,
        posicaoY: data.posicaoY ?? null,
        guestNome: data.guestNome ?? null,
        guestEmail: data.guestEmail ?? null,
      },
    })
    return feedback
  }
}
