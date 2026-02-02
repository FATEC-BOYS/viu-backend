import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NotificacaoService } from '../../src/services/notificacaoService.js'

vi.mock('../../src/database/client.js', () => ({
  default: {
    notificacao: {
      findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn(),
      create: vi.fn(), update: vi.fn(), delete: vi.fn(),
    },
    usuario: { findUnique: vi.fn() },
  },
}))

import prisma from '../../src/database/client.js'
const service = new NotificacaoService()
beforeEach(() => vi.clearAllMocks())

describe('NotificacaoService', () => {
  it('listNotificacoes deve retornar paginado', async () => {
    vi.mocked(prisma.notificacao.findMany).mockResolvedValue([])
    vi.mocked(prisma.notificacao.count).mockResolvedValue(0)
    const result = await service.listNotificacoes({ usuarioId: '1' })
    expect(result).toEqual({ notificacoes: [], total: 0 })
  })

  it('listNotificacoes deve converter filtro lida string para boolean', async () => {
    vi.mocked(prisma.notificacao.findMany).mockResolvedValue([])
    vi.mocked(prisma.notificacao.count).mockResolvedValue(0)
    await service.listNotificacoes({ usuarioId: '1', lida: 'false' })
    const call = vi.mocked(prisma.notificacao.findMany).mock.calls[0][0] as any
    expect(call.where.lida).toBe(false)
  })

  it('createNotificacao deve lançar erro se usuário não existe', async () => {
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)
    await expect(service.createNotificacao({ usuarioId: 'x' }))
      .rejects.toThrow('Usuário não encontrado')
  })

  it('markAsRead deve lançar erro se não existe', async () => {
    vi.mocked(prisma.notificacao.findUnique).mockResolvedValue(null)
    await expect(service.markAsRead('x', true)).rejects.toThrow('Notificação não encontrada')
  })

  it('deleteNotificacao deve lançar erro se não existe', async () => {
    vi.mocked(prisma.notificacao.findUnique).mockResolvedValue(null)
    await expect(service.deleteNotificacao('x')).rejects.toThrow('Notificação não encontrada')
  })
})
