// src/services/linkService.ts
/**
 * Serviço de Links Compartilhados
 *
 * Gerencia links compartilhados para artes, incluindo criação,
 * validação de tokens e geração de previews com URLs assinadas
 * do Supabase Storage.
 */

import { prisma } from '../database/client.js'
import { signPath } from '../utils/supabaseStorage.js'
import crypto from 'crypto'

export class LinkService {
  /**
   * Gera um token aleatório para o link compartilhado
   */
  private generateToken(length = 24): string {
    return crypto.randomBytes(length).toString('hex')
  }

  /**
   * Cria um link compartilhado para uma arte
   */
  async createSharedLink(data: {
    arteId: string
    expiraEm?: string
    somenteLeitura: boolean
  }) {
    // Verifica se a arte existe
    const arte = await prisma.arte.findUnique({
      where: { id: data.arteId },
    })

    if (!arte) {
      throw new Error('Arte não encontrada')
    }

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

  /**
   * Busca um preview público via token
   */
  async getPreviewByToken(token: string) {
    // Busca o link compartilhado
    const link = await prisma.linkCompartilhado.findUnique({
      where: { token },
    })

    if (!link) {
      throw new Error('Link inválido')
    }

    // Verifica se o link expirou
    if (link.expiraEm && new Date(link.expiraEm) < new Date()) {
      throw new Error('Link expirado')
    }

    if (link.tipo !== 'ARTE' || !link.arteId) {
      throw new Error('Tipo de link não suportado')
    }

    // Busca a arte
    const arte = await prisma.arte.findUnique({
      where: { id: link.arteId },
      include: {
        projeto: {
          select: {
            nome: true,
          },
        },
        autor: {
          select: {
            nome: true,
            email: true,
          },
        },
      },
    })

    if (!arte) {
      throw new Error('Arte não encontrada')
    }

    // Assina a URL do arquivo da arte
    const arquivo_url = await signPath(arte.arquivo)

    // Busca feedbacks da arte
    const feedbacks = await prisma.feedback.findMany({
      where: { arteId: arte.id },
      orderBy: { criadoEm: 'desc' },
      include: {
        autor: {
          select: {
            nome: true,
            email: true,
          },
        },
      },
    })

    // Assina URLs de áudio dos feedbacks
    const feedbacksComUrl = await Promise.all(
      feedbacks.map(async (fb: any) => {
        let arquivo_url: string | null = null
        if (fb.tipo === 'AUDIO' && fb.arquivo) {
          arquivo_url = await signPath(fb.arquivo)
        }
        return { ...fb, arquivo_url }
      })
    )

    return {
      somenteLeitura: link.somenteLeitura,
      arte: {
        ...arte,
        arquivo_url,
      },
      feedbacks: feedbacksComUrl,
    }
  }
}
