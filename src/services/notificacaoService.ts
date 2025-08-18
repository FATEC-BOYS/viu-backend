// src/services/notificacaoService.ts
/**
 * Serviço de Notificações
 *
 * Permite listar, criar e atualizar o estado (lida/não lida) das
 * notificações associadas a um usuário.
 */

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
    limit = 10,
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
    const [notificacoes, total] = await Promise.all([
      prisma.notificacao.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { criadoEm: 'desc' },
      }),
      prisma.notificacao.count({ where }),
    ])
    return { notificacoes, total }
  }
  async getNotificacaoById(id: string) {
    return prisma.notificacao.findUnique({ where: { id } })
  }
  async createNotificacao(data: any) {
    const usuario = await prisma.usuario.findUnique({ where: { id: data.usuarioId } })
    if (!usuario) throw new Error('Usuário não encontrado')
    return prisma.notificacao.create({ data })
  }
  async markAsRead(id: string, read: boolean) {
    const existing = await prisma.notificacao.findUnique({ where: { id } })
    if (!existing) throw new Error('Notificação não encontrada')
    return prisma.notificacao.update({ where: { id }, data: { lida: read } })
  }
  async deleteNotificacao(id: string) {
    const existing = await prisma.notificacao.findUnique({ where: { id } })
    if (!existing) throw new Error('Notificação não encontrada')
    await prisma.notificacao.delete({ where: { id } })
    return
  }
}