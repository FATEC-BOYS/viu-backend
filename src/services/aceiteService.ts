import prisma from '../database/client.js'

export interface RegistrarAceiteInput {
  usuarioId: string
  projetoId: string
  termoVersao?: string
  ip?: string
  userAgent?: string
}

export class AceiteService {
  async registrarAceite(data: RegistrarAceiteInput) {
    return prisma.aceiteContratual.upsert({
      where: { usuarioId_projetoId: { usuarioId: data.usuarioId, projetoId: data.projetoId } },
      create: {
        usuarioId: data.usuarioId,
        projetoId: data.projetoId,
        termoVersao: data.termoVersao ?? '1.0',
        ip: data.ip,
        userAgent: data.userAgent,
      },
      update: {
        termoVersao: data.termoVersao ?? '1.0',
        ip: data.ip,
        userAgent: data.userAgent,
      },
      include: { usuario: { select: { id: true, nome: true, email: true } }, projeto: { select: { id: true, nome: true } } },
    })
  }

  async verificarAceite(usuarioId: string, projetoId: string) {
    return prisma.aceiteContratual.findUnique({
      where: { usuarioId_projetoId: { usuarioId, projetoId } },
    })
  }

  async listarAceitesPorProjeto(projetoId: string) {
    return prisma.aceiteContratual.findMany({
      where: { projetoId },
      include: { usuario: { select: { id: true, nome: true, email: true, tipo: true } } },
      orderBy: { criadoEm: 'asc' },
    })
  }
}
