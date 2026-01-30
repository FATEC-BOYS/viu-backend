import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SessaoService } from '../../src/services/sessaoService.js'

vi.mock('../../src/database/client.js', () => ({
  default: {
    sessao: {
      findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(),
    },
  },
}))

import prisma from '../../src/database/client.js'
const service = new SessaoService()
beforeEach(() => vi.clearAllMocks())

describe('SessaoService', () => {
  it('listSessoes deve retornar sessões do usuário', async () => {
    vi.mocked(prisma.sessao.findMany).mockResolvedValue([])
    const result = await service.listSessoes({ usuarioId: '1' })
    expect(result).toEqual([])
  })

  it('listSessoes deve converter filtro ativo string', async () => {
    vi.mocked(prisma.sessao.findMany).mockResolvedValue([])
    await service.listSessoes({ usuarioId: '1', ativo: 'true' })
    const call = vi.mocked(prisma.sessao.findMany).mock.calls[0][0] as any
    expect(call.where.ativo).toBe(true)
  })

  it('getSessaoById deve retornar sessão', async () => {
    vi.mocked(prisma.sessao.findUnique).mockResolvedValue({ id: '1' } as any)
    const result = await service.getSessaoById('1')
    expect(result?.id).toBe('1')
  })

  it('revokeSessao deve lançar erro se não existe', async () => {
    vi.mocked(prisma.sessao.findUnique).mockResolvedValue(null)
    await expect(service.revokeSessao('x')).rejects.toThrow('Sessão não encontrada')
  })

  it('revokeSessao deve desativar sessão existente', async () => {
    vi.mocked(prisma.sessao.findUnique).mockResolvedValue({ id: '1' } as any)
    vi.mocked(prisma.sessao.update).mockResolvedValue({} as any)
    await service.revokeSessao('1')
    expect(prisma.sessao.update).toHaveBeenCalledWith({
      where: { id: '1' }, data: { ativo: false },
    })
  })
})
