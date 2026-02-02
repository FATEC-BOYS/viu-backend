import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ProjetoService } from '../../src/services/projetoService.js'

vi.mock('../../src/database/client.js', () => ({
  default: {
    projeto: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      aggregate: vi.fn(),
    },
    usuario: {
      findUnique: vi.fn(),
    },
  },
}))

import prisma from '../../src/database/client.js'

const service = new ProjetoService()

beforeEach(() => vi.clearAllMocks())

describe('ProjetoService.listProjetos', () => {
  it('deve retornar projetos paginados', async () => {
    vi.mocked(prisma.projeto.findMany).mockResolvedValue([
      { id: '1', nome: 'P1', criadoEm: new Date(), orcamento: null, prazo: null } as any,
    ])
    vi.mocked(prisma.projeto.count).mockResolvedValue(1)

    const result = await service.listProjetos({ page: 1, limit: 10 })
    expect(result.total).toBe(1)
    expect(result.projetos).toHaveLength(1)
  })

  it('deve aplicar filtro de search', async () => {
    vi.mocked(prisma.projeto.findMany).mockResolvedValue([])
    vi.mocked(prisma.projeto.count).mockResolvedValue(0)

    await service.listProjetos({ search: 'logo' })
    const call = vi.mocked(prisma.projeto.findMany).mock.calls[0][0] as any
    expect(call.where.OR).toBeDefined()
  })
})

describe('ProjetoService.getProjetoById', () => {
  it('deve retornar null se não encontrado', async () => {
    vi.mocked(prisma.projeto.findUnique).mockResolvedValue(null)
    const result = await service.getProjetoById('x')
    expect(result).toBeNull()
  })
})

describe('ProjetoService.createProjeto', () => {
  it('deve lançar erro se designer não existe', async () => {
    vi.mocked(prisma.usuario.findUnique)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: '2' } as any)

    await expect(service.createProjeto({ designerId: '1', clienteId: '2' }))
      .rejects.toThrow('Designer não encontrado ou inativo')
  })

  it('deve lançar erro se cliente não existe', async () => {
    vi.mocked(prisma.usuario.findUnique)
      .mockResolvedValueOnce({ id: '1' } as any)
      .mockResolvedValueOnce(null)

    await expect(service.createProjeto({ designerId: '1', clienteId: '2' }))
      .rejects.toThrow('Cliente não encontrado ou inativo')
  })

  it('deve criar projeto quando designer e cliente existem', async () => {
    vi.mocked(prisma.usuario.findUnique)
      .mockResolvedValueOnce({ id: '1' } as any)
      .mockResolvedValueOnce({ id: '2' } as any)
    vi.mocked(prisma.projeto.create).mockResolvedValue({
      id: 'p1', orcamento: 10000, prazo: new Date(), criadoEm: new Date(),
    } as any)

    const result = await service.createProjeto({ designerId: '1', clienteId: '2', nome: 'P' })
    expect(result).toBeDefined()
  })
})

describe('ProjetoService.updateProjeto', () => {
  it('deve lançar erro se projeto não existe', async () => {
    vi.mocked(prisma.projeto.findUnique).mockResolvedValue(null)
    await expect(service.updateProjeto('x', {})).rejects.toThrow('Projeto não encontrado')
  })
})

describe('ProjetoService.deleteProjeto', () => {
  it('deve lançar erro se projeto não existe', async () => {
    vi.mocked(prisma.projeto.findUnique).mockResolvedValue(null)
    await expect(service.deleteProjeto('x')).rejects.toThrow('Projeto não encontrado')
  })

  it('deve lançar erro se tem artes ou tarefas', async () => {
    vi.mocked(prisma.projeto.findUnique).mockResolvedValue({
      id: '1', _count: { artes: 1, tarefas: 0 },
    } as any)
    await expect(service.deleteProjeto('1'))
      .rejects.toThrow('Não é possível deletar projeto com artes ou tarefas associadas')
  })

  it('deve deletar projeto sem dependências', async () => {
    vi.mocked(prisma.projeto.findUnique).mockResolvedValue({
      id: '1', _count: { artes: 0, tarefas: 0 },
    } as any)
    vi.mocked(prisma.projeto.delete).mockResolvedValue({} as any)

    await service.deleteProjeto('1')
    expect(prisma.projeto.delete).toHaveBeenCalled()
  })
})

describe('ProjetoService.dashboardStats', () => {
  it('deve retornar estatísticas do dashboard', async () => {
    vi.mocked(prisma.projeto.count)
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)
    vi.mocked(prisma.projeto.findMany).mockResolvedValue([])
    vi.mocked(prisma.projeto.aggregate).mockResolvedValue({ _sum: { orcamento: 50000 } } as any)

    const result = await service.dashboardStats()
    expect(result.resumo.total).toBe(10)
    expect(result.resumo.orcamentoTotal).toBe(50000)
  })
})
