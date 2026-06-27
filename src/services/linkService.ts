import { prisma } from '../database/client.js'
import { signPath } from '../utils/storage.js'
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

  async resolveArteIdFromToken(token: string): Promise<string> {
    const link = await prisma.linkCompartilhado.findUnique({ where: { token } })
    if (!link) throw new Error('Link inválido')
    if (link.expiraEm && new Date(link.expiraEm) < new Date()) throw new Error('Link expirado')
    if (link.tipo !== 'ARTE' || !link.arteId) throw new Error('Tipo de link não suportado')
    return link.arteId
  }

  async listLinks() {
    return prisma.linkCompartilhado.findMany({
      orderBy: { criadoEm: 'desc' },
      include: {
        arte: {
          select: {
            id: true,
            nome: true,
            projeto: {
              select: {
                nome: true,
                cliente: { select: { nome: true } },
              },
            },
          },
        },
      },
    })
  }

  async updateLink(id: string, data: { expiraEm?: string | null; somenteLeitura?: boolean }) {
    const link = await prisma.linkCompartilhado.findUnique({ where: { id } })
    if (!link) throw new Error('Link não encontrado')
    return prisma.linkCompartilhado.update({
      where: { id },
      data: {
        ...(data.somenteLeitura !== undefined && { somenteLeitura: data.somenteLeitura }),
        ...(data.expiraEm !== undefined && {
          expiraEm: data.expiraEm === null ? null : new Date(data.expiraEm),
        }),
      },
    })
  }

  async deleteLink(id: string) {
    const link = await prisma.linkCompartilhado.findUnique({ where: { id } })
    if (!link) throw new Error('Link não encontrado')
    await prisma.linkCompartilhado.delete({ where: { id } })
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
        autor: { select: { nome: true } }, // email omitted from public preview
      },
    })
    if (!arte) throw new Error('Arte não encontrada')

    const arquivo_url = await signPath(arte.arquivo)

    const feedbacks = await prisma.feedback.findMany({
      where: { arteId: arte.id },
      orderBy: { criadoEm: 'desc' },
      include: { autor: { select: { nome: true } } }, // email omitted from public preview
    })

    const feedbacksComUrl = await Promise.all(
      feedbacks.map(async (fb: any) => ({
        ...fb,
        arquivo_url: fb.tipo === 'AUDIO' && fb.arquivo ? await signPath(fb.arquivo) : null,
      })),
    )

    return { somenteLeitura: link.somenteLeitura, arte: { ...arte, arquivo_url }, feedbacks: feedbacksComUrl }
  }
}
