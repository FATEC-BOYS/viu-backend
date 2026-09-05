import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ArteService } from '../../src/services/arteService.js'

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  return { default: criarPrismaMock() }
})

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

// updateArte/deleteArte passaram a exigir o requisitante: a autorização
// deixou de morar só no middleware da rota. Os casos abaixo usam o designer do
// projeto — a negação de terceiros é coberta em tests/security.
const DONO = 'designer-1'
const ARTE_DO_DONO = { id: '1', projeto: { designerId: DONO, clienteId: 'cliente-1' } }

describe('ArteService.updateArte', () => {
  it('deve lançar erro se arte não existe', async () => {
    vi.mocked(prisma.arte.findUnique).mockResolvedValue(null)
    await expect(service.updateArte('x', {}, DONO)).rejects.toThrow('Arte não encontrada')
  })
})

describe('ArteService.deleteArte', () => {
  it('deve lançar erro se arte não existe', async () => {
    vi.mocked(prisma.arte.findUnique).mockResolvedValue(null)
    await expect(service.deleteArte('x', DONO)).rejects.toThrow('Arte não encontrada')
  })

  it('deve deletar arte existente', async () => {
    vi.mocked(prisma.arte.findUnique).mockResolvedValue(ARTE_DO_DONO as any)
    vi.mocked(prisma.arte.delete).mockResolvedValue({} as any)
    await service.deleteArte('1', DONO)
    expect(prisma.arte.delete).toHaveBeenCalled()
  })
})
