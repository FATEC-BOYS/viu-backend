import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TarefaService } from '../../src/services/tarefaService.js'

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  return { default: criarPrismaMock() }
})

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

  it('createTarefa deve lançar erro se responsável não participa do projeto', async () => {
    // A regra deixou de ser "o usuário existe" e passou a ser "é designer ou
    // cliente deste projeto".
    vi.mocked(prisma.projeto.findUnique).mockResolvedValue({
      id: 'p1', designerId: 'd1', clienteId: 'c1',
    } as any)
    await expect(service.createTarefa({ projetoId: 'p1', responsavelId: 'estranho' }))
      .rejects.toThrow('Responsável não é participante do projeto')
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
