import { prisma } from '../database/client.js'
import { signPath } from '../utils/storage.js'
import crypto from 'crypto'

export class LinkService {
  private generateToken(length = 24): string {
    return crypto.randomBytes(length).toString('hex')
  }

  async assertLinkOwnership(id: string, userId: string, isAdmin: boolean) {
    if (isAdmin) return
    const link = await prisma.linkCompartilhado.findUnique({
      where: { id },
      include: { arte: { include: { projeto: { select: { designerId: true, clienteId: true } } } } },
    })
    if (!link) throw new Error('Link não encontrado')
    const projeto = link.arte?.projeto
    if (!projeto || (projeto.designerId !== userId && projeto.clienteId !== userId)) {
      throw new Error('Acesso negado')
    }
  }

  async createSharedLink(data: {
    arteId: string
    expiraEm?: string
    somenteLeitura: boolean
    limiteTentativas?: number
  }, userId: string, isAdmin: boolean) {
    const arte = await prisma.arte.findUnique({
      where: { id: data.arteId },
      include: { projeto: { select: { designerId: true, clienteId: true } } },
    })
    if (!arte) throw new Error('Arte não encontrada')
    if (!isAdmin && arte.projeto.designerId !== userId && arte.projeto.clienteId !== userId) {
      throw new Error('Acesso negado')
    }

    const token = this.generateToken()
    return prisma.linkCompartilhado.create({
      data: {
        token,
        tipo: 'ARTE',
        arteId: data.arteId,
        expiraEm: data.expiraEm ? new Date(data.expiraEm) : null,
        somenteLeitura: data.somenteLeitura,
        limiteTentativas: data.limiteTentativas ?? null,
      },
    })
  }

  private assertLinkValid(link: {
    revogado: boolean
    expiraEm: Date | null
    limiteTentativas: number | null
    acessos: number
    tipo: string
    arteId: string | null
  }) {
    if (link.revogado) throw new Error('Link revogado')
    if (link.expiraEm && new Date(link.expiraEm) < new Date()) throw new Error('Link expirado')
    if (link.limiteTentativas !== null && link.acessos >= link.limiteTentativas) {
      throw new Error('Limite de acessos atingido')
    }
    if (link.tipo !== 'ARTE' || !link.arteId) throw new Error('Tipo de link não suportado')
  }

  async resolveArteIdFromToken(token: string): Promise<string> {
    const link = await prisma.linkCompartilhado.findUnique({ where: { token } })
    if (!link) throw new Error('Link inválido')
    this.assertLinkValid(link)
    if (link.somenteLeitura) throw new Error('somenteLeitura')
    return link.arteId!
  }

  async listLinks(userId: string, isAdmin: boolean) {
    const where = isAdmin ? {} : {
      arte: { projeto: { OR: [{ designerId: userId }, { clienteId: userId }] } },
    }
    return prisma.linkCompartilhado.findMany({
      where,
      orderBy: { criadoEm: 'desc' },
      include: {
        arte: {
          select: {
            id: true,
            nome: true,
            projeto: { select: { nome: true, cliente: { select: { nome: true } } } },
          },
        },
      },
    })
  }

  async updateLink(id: string, data: { expiraEm?: string | null; somenteLeitura?: boolean; limiteTentativas?: number | null }) {
    const link = await prisma.linkCompartilhado.findUnique({ where: { id } })
    if (!link) throw new Error('Link não encontrado')
    return prisma.linkCompartilhado.update({
      where: { id },
      data: {
        ...(data.somenteLeitura !== undefined && { somenteLeitura: data.somenteLeitura }),
        ...(data.expiraEm !== undefined && { expiraEm: data.expiraEm === null ? null : new Date(data.expiraEm) }),
        ...(data.limiteTentativas !== undefined && { limiteTentativas: data.limiteTentativas }),
      },
    })
  }

  async revokeLink(id: string) {
    const link = await prisma.linkCompartilhado.findUnique({ where: { id } })
    if (!link) throw new Error('Link não encontrado')
    return prisma.linkCompartilhado.update({ where: { id }, data: { revogado: true } })
  }

  async deleteLink(id: string) {
    const link = await prisma.linkCompartilhado.findUnique({ where: { id } })
    if (!link) throw new Error('Link não encontrado')
    await prisma.linkCompartilhado.delete({ where: { id } })
  }

  async getPreviewByToken(token: string) {
    const link = await prisma.linkCompartilhado.findUnique({ where: { token } })
    if (!link) throw new Error('Link inválido')

    // All validity checks unified — caller always gets a generic 404
    this.assertLinkValid(link)

    // Increment access counter (fire-and-forget — counter failure never blocks the response)
    prisma.linkCompartilhado.update({
      where: { token },
      data: { acessos: { increment: 1 } },
    }).catch(() => {})

    const arte = await prisma.arte.findUnique({
      where: { id: link.arteId! },
      include: {
        projeto: { select: { nome: true } },
        autor: { select: { nome: true } },
      },
    })
    if (!arte) throw new Error('Arte não encontrada')

    const arquivo_url = await signPath(arte.arquivo)

    const feedbacks = await prisma.feedback.findMany({
      where: { arteId: arte.id, publico: true },
      orderBy: { criadoEm: 'desc' },
      include: { autor: { select: { nome: true } } },
    })

    const feedbacksComUrl = await Promise.all(
      feedbacks.map(async (fb: any) => ({
        ...fb,
        arquivo_url: fb.tipo === 'AUDIO' && fb.arquivo ? await signPath(fb.arquivo) : null,
      })),
    )

    return { somenteLeitura: link.somenteLeitura, acessos: link.acessos + 1, arte: { ...arte, arquivo_url }, feedbacks: feedbacksComUrl }
  }
}
