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
  function semArtes() {
    vi.mocked(prisma.arte.findMany).mockResolvedValue([])
    vi.mocked(prisma.arte.count).mockResolvedValue(0)
    vi.mocked(prisma.arte.groupBy).mockResolvedValue([] as any)
  }

  /** O argumento com que a listagem chamou o Prisma. */
  function chamada() {
    return vi.mocked(prisma.arte.findMany).mock.calls[0][0] as any
  }

  it('deve retornar artes paginadas', async () => {
    semArtes()
    const result = await service.listArtes({})
    expect(result).toEqual({ artes: [], total: 0, porStatus: {} })
  })

  /*
   * O cliente não é campo da arte: ele mora no projeto. Era o único filtro da
   * tela de Artes que o serviço não sabia atender — e por isso a tela mandava
   * e nada acontecia.
   */
  it('filtra pelo cliente do projeto', async () => {
    semArtes()
    await service.listArtes({ clienteId: 'cli1' })
    expect(chamada().where.projeto).toEqual({ clienteId: 'cli1' })
  })

  it('não estreita nada quando não pedem cliente', async () => {
    semArtes()
    await service.listArtes({})
    expect(chamada().where.projeto).toBeUndefined()
  })

  it('mantém o escopo de acesso junto com o filtro de cliente', async () => {
    // Filtrar não pode afrouxar autorização: as duas condições somam.
    semArtes()
    await service.listArtes({ clienteId: 'cli1', projetoIds: ['p1', 'p2'] })
    const { where } = chamada()
    expect(where.projetoId).toEqual({ in: ['p1', 'p2'] })
    expect(where.projeto).toEqual({ clienteId: 'cli1' })
  })

  it('ordena pelo que a tela pediu', async () => {
    semArtes()
    await service.listArtes({ orderBy: 'nome' })
    expect(chamada().orderBy).toEqual({ nome: 'asc' })

    vi.clearAllMocks()
    semArtes()
    await service.listArtes({ orderBy: 'projeto' })
    expect(chamada().orderBy).toEqual({ projeto: { nome: 'asc' } })
  })

  it('cai na mais recente quando a ordem não é uma das conhecidas', async () => {
    // A ordem vem da URL, então qualquer texto pode chegar aqui.
    semArtes()
    await service.listArtes({ orderBy: 'sql injection' as any })
    expect(chamada().orderBy).toEqual({ criadoEm: 'desc' })
  })

  /*
   * As contagens por status descrevem o mesmo conjunto que o total — o
   * filtrado, não a página. A tela as somava a partir das artes que tinha na
   * mão, e com mais de uma página o cabeçalho dizia "13 itens" e "4 em
   * análise" sobre as mesmas artes.
   */
  it('conta por status sobre o mesmo filtro do total', async () => {
    vi.mocked(prisma.arte.findMany).mockResolvedValue([])
    vi.mocked(prisma.arte.count).mockResolvedValue(13)
    vi.mocked(prisma.arte.groupBy).mockResolvedValue([
      { status: 'EM_ANALISE', _count: { _all: 11 } },
      { status: 'APROVADO', _count: { _all: 2 } },
    ] as any)

    const { porStatus } = await service.listArtes({ tipo: 'IMAGEM' })

    expect(porStatus).toEqual({ EM_ANALISE: 11, APROVADO: 2 })
    const argumento = vi.mocked(prisma.arte.groupBy).mock.calls[0][0] as any
    expect(argumento.where).toEqual(chamada().where)
  })
})

/**
 * As opções de filtro são as POSSÍVEIS, não as presentes no resultado.
 *
 * A tela as montava a partir da página que já tinha — filtrada. Escolher um
 * cliente deixava só ele na lista de clientes, e trocar exigia limpar antes.
 */
describe('ArteService.facetasDeArtes', () => {
  const PROJETOS = [
    { id: 'p1', nome: 'Identidade', cliente: { id: 'c1', nome: 'João' } },
    { id: 'p2', nome: 'Site', cliente: { id: 'c1', nome: 'João' } },
    { id: 'p3', nome: 'Cartaz', cliente: { id: 'c2', nome: 'Ana' } },
  ]

  function comDados() {
    vi.mocked(prisma.projeto.findMany).mockResolvedValue(PROJETOS as any)
    vi.mocked(prisma.arte.findMany)
      .mockResolvedValueOnce([{ autor: { id: 'a1', nome: 'Ana Silva' } }] as any)
      .mockResolvedValueOnce([{ tipo: 'IMAGEM' }, { tipo: 'DOCUMENTO' }] as any)
  }

  it('não repete o cliente que tem mais de um projeto', async () => {
    comDados()
    const { clientes } = await service.facetasDeArtes()
    expect(clientes).toEqual([
      { id: 'c2', nome: 'Ana' },
      { id: 'c1', nome: 'João' },
    ])
  })

  it('devolve projetos, autores e tipos', async () => {
    comDados()
    const facetas = await service.facetasDeArtes()
    expect(facetas.projetos).toEqual([
      { id: 'p1', nome: 'Identidade' },
      { id: 'p2', nome: 'Site' },
      { id: 'p3', nome: 'Cartaz' },
    ])
    expect(facetas.autores).toEqual([{ id: 'a1', nome: 'Ana Silva' }])
    expect(facetas.tipos).toEqual(['IMAGEM', 'DOCUMENTO'])
  })

  it('respeita o escopo de acesso de quem pergunta', async () => {
    comDados()
    await service.facetasDeArtes({ projetoIds: ['p1'] })
    const projetos = vi.mocked(prisma.projeto.findMany).mock.calls[0][0] as any
    expect(projetos.where.id).toEqual({ in: ['p1'] })
    // E só projetos com arte: um projeto vazio é um filtro que só pode dar lista vazia.
    expect(projetos.where.artes).toEqual({ some: {} })
    const artes = vi.mocked(prisma.arte.findMany).mock.calls[0][0] as any
    expect(artes.where).toEqual({ projetoId: { in: ['p1'] } })
  })

  it('sem escopo (admin), não restringe', async () => {
    comDados()
    await service.facetasDeArtes()
    const projetos = vi.mocked(prisma.projeto.findMany).mock.calls[0][0] as any
    expect(projetos.where.id).toBeUndefined()
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
