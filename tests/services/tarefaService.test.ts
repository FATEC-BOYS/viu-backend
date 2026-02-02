import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TarefaService } from '../../src/services/tarefaService.js'

vi.mock('../../src/database/client.js', () => ({
  default: {
    tarefa: {
      findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn(),
      create: vi.fn(), update: vi.fn(), delete: vi.fn(),
    },
    projeto: { findUnique: vi.fn() },
    usuario: { findUnique: vi.fn() },
  },
}))

import prisma from '../../src/database/client.js'
const service = new TarefaService()
beforeEach(() => vi.clearAllMocks())

describe('TarefaService', () => {
  it('listTarefas deve retornar paginado', async () => {
    vi.mocked(prisma.tarefa.findMany).mockResolvedValue([])
    vi.mocked(prisma.tarefa.count).mockResolvedValue(0)
    const result = await service.listTarefas({})
    expect(result).toEqual({ tarefas: [], total: 0 })
  })

  it('createTarefa deve lançar erro se responsável não existe', async () => {
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)
    await expect(service.createTarefa({ responsavelId: 'x' }))
      .rejects.toThrow('Responsável não encontrado')
  })

  it('createTarefa deve lançar erro se projeto não existe', async () => {
    vi.mocked(prisma.projeto.findUnique).mockResolvedValue(null)
    await expect(service.createTarefa({ projetoId: 'x', responsavelId: '1' }))
      .rejects.toThrow('Projeto não encontrado')
  })

  it('updateTarefa deve lançar erro se não existe', async () => {
    vi.mocked(prisma.tarefa.findUnique).mockResolvedValue(null)
    await expect(service.updateTarefa('x', {})).rejects.toThrow('Tarefa não encontrada')
  })

  it('deleteTarefa deve lançar erro se não existe', async () => {
    vi.mocked(prisma.tarefa.findUnique).mockResolvedValue(null)
    await expect(service.deleteTarefa('x')).rejects.toThrow('Tarefa não encontrada')
  })
})
