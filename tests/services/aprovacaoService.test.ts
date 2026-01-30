import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AprovacaoService } from '../../src/services/aprovacaoService.js'

vi.mock('../../src/database/client.js', () => ({
  default: {
    aprovacao: {
      findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn(),
      create: vi.fn(), update: vi.fn(), delete: vi.fn(),
    },
    arte: { findUnique: vi.fn() },
    usuario: { findUnique: vi.fn() },
  },
}))

import prisma from '../../src/database/client.js'
const service = new AprovacaoService()
beforeEach(() => vi.clearAllMocks())

describe('AprovacaoService', () => {
  it('listAprovacoes deve retornar paginado', async () => {
    vi.mocked(prisma.aprovacao.findMany).mockResolvedValue([])
    vi.mocked(prisma.aprovacao.count).mockResolvedValue(0)
    const result = await service.listAprovacoes({})
    expect(result).toEqual({ aprovacoes: [], total: 0 })
  })

  it('createAprovacao deve lançar erro se arte não existe', async () => {
    vi.mocked(prisma.arte.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue({ id: '1' } as any)
    await expect(service.createAprovacao({ arteId: 'x', aprovadorId: '1' }))
      .rejects.toThrow('Arte não encontrada')
  })

  it('createAprovacao deve lançar erro se aprovador não existe', async () => {
    vi.mocked(prisma.arte.findUnique).mockResolvedValue({ id: '1' } as any)
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)
    await expect(service.createAprovacao({ arteId: '1', aprovadorId: 'x' }))
      .rejects.toThrow('Aprovador não encontrado')
  })

  it('updateAprovacao deve lançar erro se não existe', async () => {
    vi.mocked(prisma.aprovacao.findUnique).mockResolvedValue(null)
    await expect(service.updateAprovacao('x', {})).rejects.toThrow('Aprovação não encontrada')
  })

  it('deleteAprovacao deve lançar erro se não existe', async () => {
    vi.mocked(prisma.aprovacao.findUnique).mockResolvedValue(null)
    await expect(service.deleteAprovacao('x')).rejects.toThrow('Aprovação não encontrada')
  })
})
