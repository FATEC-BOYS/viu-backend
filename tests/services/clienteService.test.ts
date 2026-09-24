import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  return { default: criarPrismaMock() }
})

import prisma from '../../src/database/client.js'
import { ClienteService } from '../../src/services/clienteService.js'

const service = new ClienteService()

function projeto(extra: Record<string, unknown> = {}) {
  return {
    id: 'proj1',
    nome: 'Rebranding',
    descricao: null,
    status: 'EM_ANDAMENTO',
    orcamento: 500000,
    prazo: new Date('2026-10-01'),
    criadoEm: new Date('2026-09-01'),
    cliente: {
      id: 'cliente1',
      nome: 'João Santos',
      email: 'joao@x.com',
      telefone: null,
      avatar: null,
      criadoEm: new Date('2026-01-01'),
    },
    ...extra,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.vinculoCliente.findMany).mockResolvedValue([] as never)
})

/*
 * A carteira vivia só no navegador, montada de `getAll('/projetos')` — que
 * pagina de cem em cem até vinte páginas e para em silêncio. Passando de dois
 * mil projetos, um cliente sumia da carteira, e /clientes/[id] afirmava
 * "Cliente não encontrado na sua carteira" sobre alguém que está lá.
 */
describe('A carteira do designer', () => {
  it('agrupa por pessoa: um cliente com dois projetos é uma linha', async () => {
    vi.mocked(prisma.projeto.findMany).mockResolvedValue([
      projeto(),
      projeto({ id: 'proj2', nome: 'Identidade' }),
    ] as never)

    const carteira = await service.listarClientes('designer1')

    expect(carteira).toHaveLength(1)
    expect(carteira[0].projetos).toHaveLength(2)
    expect(carteira[0].nome).toBe('João Santos')
  })

  /* O escopo É a resposta: só saem clientes de projetos deste designer. */
  it('consulta apenas os projetos do designer que pediu', async () => {
    vi.mocked(prisma.projeto.findMany).mockResolvedValue([] as never)

    await service.listarClientes('designer1')

    const { where } = vi.mocked(prisma.projeto.findMany).mock.calls[0][0] as any
    expect(where.designerId).toBe('designer1')
  })

  /*
   * O laço rompido vinha de uma segunda requisição e de um Set montado no
   * navegador. Duas chamadas para uma pergunta só.
   */
  it('resolve o vínculo rompido no servidor', async () => {
    vi.mocked(prisma.projeto.findMany).mockResolvedValue([projeto()] as never)
    vi.mocked(prisma.vinculoCliente.findMany).mockResolvedValue([
      { clienteId: 'cliente1' },
    ] as never)

    const carteira = await service.listarClientes('designer1')

    expect(carteira[0].vinculado).toBe(false)
    // Só os rompidos entram na consulta — laço ativo tem `rompidoEm` nulo.
    const { where } = vi.mocked(prisma.vinculoCliente.findMany).mock.calls[0][0] as any
    expect(where.rompidoEm).toEqual({ not: null })
  })

  it('marca como vinculado quem não tem rompimento', async () => {
    vi.mocked(prisma.projeto.findMany).mockResolvedValue([projeto()] as never)

    const carteira = await service.listarClientes('designer1')

    expect(carteira[0].vinculado).toBe(true)
  })

  /* Ordenar é do banco: assim as duas telas concordam sem cada uma
     reimplementar a regra. */
  it('pede ao banco a ordem por prazo, com quem não tem prazo no fim', async () => {
    vi.mocked(prisma.projeto.findMany).mockResolvedValue([] as never)

    await service.listarClientes('designer1')

    const { orderBy } = vi.mocked(prisma.projeto.findMany).mock.calls[0][0] as any
    expect(orderBy[0]).toEqual({ prazo: { sort: 'asc', nulls: 'last' } })
  })

  it('ignora projeto sem cliente em vez de quebrar', async () => {
    vi.mocked(prisma.projeto.findMany).mockResolvedValue([
      projeto(),
      projeto({ id: 'proj3', cliente: null }),
    ] as never)

    const carteira = await service.listarClientes('designer1')

    expect(carteira).toHaveLength(1)
  })
})

describe('Um cliente só', () => {
  /* A tela de detalhe baixava a carteira inteira para mostrar uma pessoa. */
  it('estreita a consulta no banco em vez de filtrar depois', async () => {
    vi.mocked(prisma.projeto.findMany).mockResolvedValue([projeto()] as never)

    await service.getCliente('designer1', 'cliente1')

    const { where } = vi.mocked(prisma.projeto.findMany).mock.calls[0][0] as any
    expect(where).toEqual({ designerId: 'designer1', clienteId: 'cliente1' })
  })

  /* Sem projeto em comum não é cliente deste designer — e é isso que a
     ausência significa aqui. */
  it('devolve null quando não há projeto em comum', async () => {
    vi.mocked(prisma.projeto.findMany).mockResolvedValue([] as never)

    await expect(service.getCliente('designer1', 'estranho')).resolves.toBeNull()
  })
})
