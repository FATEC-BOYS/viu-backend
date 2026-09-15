import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ProjetoService } from '../../src/services/projetoService.js'

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  return { default: criarPrismaMock() }
})

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
    // as condições passaram a ser acumuladas em AND, com o OR do search dentro
    expect(call.where.AND).toEqual(
      expect.arrayContaining([expect.objectContaining({ OR: expect.any(Array) })]),
    )
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

  /**
   * Ser cliente é posição no projeto, não tipo de conta.
   *
   * Enquanto a consulta do cliente exigia `tipo: 'CLIENTE'`, um designer nunca
   * podia contratar outro designer — e a saída de quem precisava era abrir uma
   * segunda conta com outro e-mail. A mesma pessoa, duas contas, a fila dela
   * partida ao meio.
   */
  describe('quem pode ocupar a posição de cliente', () => {
    it('não filtra o cliente por tipo de conta', async () => {
      vi.mocked(prisma.usuario.findUnique)
        .mockResolvedValueOnce({ id: 'd1' } as any)
        .mockResolvedValueOnce({ id: 'd2' } as any)
      vi.mocked(prisma.projeto.create).mockResolvedValue({
        id: 'p1', orcamento: null, prazo: null, criadoEm: new Date(),
      } as any)

      // Designer contratando outro designer: o cliente aqui é conta DESIGNER.
      await service.createProjeto({ designerId: 'd1', clienteId: 'd2', nome: 'Marca do estúdio' })

      const [, chamadaDoCliente] = vi.mocked(prisma.usuario.findUnique).mock.calls
      expect((chamadaDoCliente[0] as any).where).toEqual({ id: 'd2', ativo: true })
      expect((chamadaDoCliente[0] as any).where.tipo).toBeUndefined()
    })

    it('continua exigindo que o designer seja designer', async () => {
      vi.mocked(prisma.usuario.findUnique)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'c1' } as any)

      await expect(service.createProjeto({ designerId: 'x', clienteId: 'c1' }))
        .rejects.toThrow('Designer não encontrado ou inativo')

      const [chamadaDoDesigner] = vi.mocked(prisma.usuario.findUnique).mock.calls
      expect((chamadaDoDesigner[0] as any).where.tipo).toBe('DESIGNER')
    })

    it('conta inativa (ou excluída) não ocupa a posição', async () => {
      // `deactivateUsuario` desliga e carimba `excluidoEm` na mesma transação,
      // então `ativo: true` já cobre os dois casos.
      vi.mocked(prisma.usuario.findUnique)
        .mockResolvedValueOnce({ id: 'd1' } as any)
        .mockResolvedValueOnce(null)

      await expect(service.createProjeto({ designerId: 'd1', clienteId: 'sumido' }))
        .rejects.toThrow('Cliente não encontrado ou inativo')

      const [, chamadaDoCliente] = vi.mocked(prisma.usuario.findUnique).mock.calls
      expect((chamadaDoCliente[0] as any).where.ativo).toBe(true)
    })

    /*
     * Guarda NOVA: antes ela era acidental. Exigir tipos opostos nos dois lados
     * tornava impossível os dois ids serem o mesmo; soltando o tipo do cliente,
     * o caso passa a ser alcançável.
     */
    it('ninguém é cliente do próprio projeto', async () => {
      await expect(service.createProjeto({ designerId: 'd1', clienteId: 'd1', nome: 'P' }))
        .rejects.toMatchObject({ codigo: 'CLIENTE_INVALIDO' })

      expect(prisma.usuario.findUnique).not.toHaveBeenCalled()
      expect(prisma.projeto.create).not.toHaveBeenCalled()
    })
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
