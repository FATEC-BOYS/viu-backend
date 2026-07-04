import prisma from '../database/client.js'

export interface ListNotificacoesParams {
  page?: number
  limit?: number
  usuarioId: string
  tipo?: string
  canal?: string
  lida?: string | boolean
}

export class NotificacaoService {
  async listNotificacoes({
    page = 1,
    limit = 20,
    usuarioId,
    tipo,
    canal,
    lida,
  }: ListNotificacoesParams) {
    const skip = (page - 1) * limit
    let lidaFilter: boolean | undefined
    if (lida !== undefined) {
      if (typeof lida === 'string') lidaFilter = lida === 'true'
      else lidaFilter = lida
    }
    const where: any = {
      usuarioId,
      ...(tipo && { tipo }),
      ...(canal && { canal }),
      ...(lidaFilter !== undefined && { lida: lidaFilter }),
    }
    const [notificacoes, total, naoLidas] = await Promise.all([
      prisma.notificacao.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { criadoEm: 'desc' },
      }),
      prisma.notificacao.count({ where }),
      prisma.notificacao.count({ where: { usuarioId, lida: false } }),
    ])
    return { notificacoes, total, naoLidas }
  }

  async getNotificacaoById(id: string, usuarioId: string) {
    const n = await prisma.notificacao.findUnique({ where: { id } })
    if (!n) return null
    if (n.usuarioId !== usuarioId) throw new Error('Acesso negado')
    return n
  }

  async createNotificacao(data: any) {
    const usuario = await prisma.usuario.findUnique({ where: { id: data.usuarioId } })
    if (!usuario) throw new Error('Usuário não encontrado')
    return prisma.notificacao.create({ data })
  }

  async markAsRead(id: string, usuarioId: string, read: boolean) {
    const existing = await prisma.notificacao.findUnique({ where: { id } })
    if (!existing) throw new Error('Notificação não encontrada')
    if (existing.usuarioId !== usuarioId) throw new Error('Acesso negado')
    return prisma.notificacao.update({ where: { id }, data: { lida: read } })
  }

  async markAllAsRead(usuarioId: string) {
    return prisma.notificacao.updateMany({
      where: { usuarioId, lida: false },
      data: { lida: true },
    })
  }

  async deleteNotificacao(id: string, usuarioId: string) {
    const existing = await prisma.notificacao.findUnique({ where: { id } })
    if (!existing) throw new Error('Notificação não encontrada')
    if (existing.usuarioId !== usuarioId) throw new Error('Acesso negado')
    await prisma.notificacao.delete({ where: { id } })
  }

  // Fire-and-forget: never awaited at the call site — errors are logged, never thrown
  dispatch(
    usuarioId: string,
    tipo: string,
    titulo: string,
    conteudo: string,
    canal: string = 'SISTEMA',
  ): void {
    prisma.notificacao
      .create({ data: { usuarioId, tipo, titulo, conteudo, canal } })
      .catch((err) => console.error(`[notificacao] dispatch falhou para ${usuarioId}:`, err))
  }
}

export const notificacaoService = new NotificacaoService()
