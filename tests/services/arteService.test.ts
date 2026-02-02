import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ArteService } from '../../src/services/arteService.js'

vi.mock('../../src/database/client.js', () => ({
  default: {
    arte: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    projeto: { findUnique: vi.fn() },
    usuario: { findUnique: vi.fn() },
  },
}))

import prisma from '../../src/database/client.js'

const service = new ArteService()
beforeEach(() => vi.clearAllMocks())

describe('ArteService.listArtes', () => {
  it('deve retornar artes paginadas', async () => {
    vi.mocked(prisma.arte.findMany).mockResolvedValue([])
    vi.mocked(prisma.arte.count).mockResolvedValue(0)
    const result = await service.listArtes({})
    expect(result).toEqual({ artes: [], total: 0 })
  })
})

describe('ArteService.getArteById', () => {
  it('deve retornar arte por ID', async () => {
    vi.mocked(prisma.arte.findUnique).mockResolvedValue({ id: '1' } as any)
    const result = await service.getArteById('1')
    expect(result?.id).toBe('1')
  })
})

describe('ArteService.createArte', () => {
  it('deve lançar erro se projeto não existe', async () => {
    vi.mocked(prisma.projeto.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue({ id: '1' } as any)
    await expect(service.createArte({ projetoId: 'x', autorId: '1' }))
      .rejects.toThrow('Projeto não encontrado')
  })

  it('deve lançar erro se autor não existe', async () => {
    vi.mocked(prisma.projeto.findUnique).mockResolvedValue({ id: '1' } as any)
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)
    await expect(service.createArte({ projetoId: '1', autorId: 'x' }))
      .rejects.toThrow('Autor não encontrado')
  })

  it('deve criar arte quando dados válidos', async () => {
    vi.mocked(prisma.projeto.findUnique).mockResolvedValue({ id: '1' } as any)
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue({ id: '1' } as any)
    vi.mocked(prisma.arte.create).mockResolvedValue({ id: 'a1' } as any)
    const result = await service.createArte({ projetoId: '1', autorId: '1' })
    expect(result.id).toBe('a1')
  })
})

describe('ArteService.updateArte', () => {
  it('deve lançar erro se arte não existe', async () => {
    vi.mocked(prisma.arte.findUnique).mockResolvedValue(null)
    await expect(service.updateArte('x', {})).rejects.toThrow('Arte não encontrada')
  })
})

describe('ArteService.deleteArte', () => {
  it('deve lançar erro se arte não existe', async () => {
    vi.mocked(prisma.arte.findUnique).mockResolvedValue(null)
    await expect(service.deleteArte('x')).rejects.toThrow('Arte não encontrada')
  })

  it('deve deletar arte existente', async () => {
    vi.mocked(prisma.arte.findUnique).mockResolvedValue({ id: '1' } as any)
    vi.mocked(prisma.arte.delete).mockResolvedValue({} as any)
    await service.deleteArte('1')
    expect(prisma.arte.delete).toHaveBeenCalled()
  })
})
