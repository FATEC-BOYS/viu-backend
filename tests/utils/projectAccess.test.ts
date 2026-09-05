/**
 * Helper central de isolamento por projeto.
 *
 * Vale testar isolado porque seis controllers dependem dele: um erro aqui é
 * um erro em todos ao mesmo tempo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  return { default: criarPrismaMock() }
})

import prisma from '../../src/database/client.js'
import {
  getAccessibleProjectIds,
  checkProjectAccess,
  assertAcessoAoProjeto,
  assertProjectAccessById,
  participaDoProjeto,
  projetoDoUsuarioWhere,
} from '../../src/utils/projectAccess.js'

const PROJETO = { designerId: 'd1', clienteId: 'c1' }

beforeEach(() => vi.clearAllMocks())

describe('participaDoProjeto', () => {
  it('aceita designer e cliente', () => {
    expect(participaDoProjeto(PROJETO, 'd1')).toBe(true)
    expect(participaDoProjeto(PROJETO, 'c1')).toBe(true)
  })

  it('recusa terceiros', () => {
    expect(participaDoProjeto(PROJETO, 'x1')).toBe(false)
  })

  it('recusa projeto ausente — nunca "na dúvida, libera"', () => {
    expect(participaDoProjeto(null, 'd1')).toBe(false)
    expect(participaDoProjeto(undefined, 'd1')).toBe(false)
  })
})

describe('projetoDoUsuarioWhere', () => {
  it('cobre os dois lados do vínculo', () => {
    expect(projetoDoUsuarioWhere('u1')).toEqual({
      OR: [{ designerId: 'u1' }, { clienteId: 'u1' }],
    })
  })
})

describe('getAccessibleProjectIds', () => {
  it('devolve os ids dos projetos do usuário', async () => {
    vi.mocked(prisma.projeto.findMany).mockResolvedValue([{ id: 'p1' }, { id: 'p2' }] as any)

    await expect(getAccessibleProjectIds('u1')).resolves.toEqual(['p1', 'p2'])
    expect(prisma.projeto.findMany).toHaveBeenCalledWith({
      where: { OR: [{ designerId: 'u1' }, { clienteId: 'u1' }] },
      select: { id: true },
    })
  })

  it('devolve null para ADMIN — ausência de escopo, não escopo vazio', async () => {
    await expect(getAccessibleProjectIds('admin', true)).resolves.toBeNull()
    expect(prisma.projeto.findMany).not.toHaveBeenCalled()
  })

  it('devolve lista vazia para quem não tem projeto (≠ null)', async () => {
    vi.mocked(prisma.projeto.findMany).mockResolvedValue([] as any)
    await expect(getAccessibleProjectIds('novato')).resolves.toEqual([])
  })
})

describe('checkProjectAccess', () => {
  it('ok para participante', async () => {
    vi.mocked(prisma.projeto.findUnique).mockResolvedValue(PROJETO as any)
    await expect(checkProjectAccess('p1', 'd1')).resolves.toBe('ok')
  })

  it('negado para terceiro', async () => {
    vi.mocked(prisma.projeto.findUnique).mockResolvedValue(PROJETO as any)
    await expect(checkProjectAccess('p1', 'x1')).resolves.toBe('negado')
  })

  it('distingue projeto inexistente de acesso negado', async () => {
    vi.mocked(prisma.projeto.findUnique).mockResolvedValue(null)
    await expect(checkProjectAccess('fantasma', 'd1')).resolves.toBe('nao-encontrado')
  })

  it('ADMIN passa sem consultar o banco', async () => {
    await expect(checkProjectAccess('p1', 'admin', true)).resolves.toBe('ok')
    expect(prisma.projeto.findUnique).not.toHaveBeenCalled()
  })
})

describe('assertAcessoAoProjeto', () => {
  it('não lança para participante', () => {
    expect(() => assertAcessoAoProjeto(PROJETO, 'c1')).not.toThrow()
  })

  it('lança para terceiro', () => {
    expect(() => assertAcessoAoProjeto(PROJETO, 'x1')).toThrow(/Acesso negado/)
  })

  it('lança para projeto nulo', () => {
    expect(() => assertAcessoAoProjeto(null, 'd1')).toThrow(/Acesso negado/)
  })

  it('ADMIN passa mesmo sem projeto', () => {
    expect(() => assertAcessoAoProjeto(null, 'admin', true)).not.toThrow()
  })
})

describe('assertProjectAccessById', () => {
  it('mensagem distinta para inexistente e para negado', async () => {
    vi.mocked(prisma.projeto.findUnique).mockResolvedValue(null)
    await expect(assertProjectAccessById('fantasma', 'd1')).rejects.toThrow(
      'Projeto não encontrado',
    )

    vi.mocked(prisma.projeto.findUnique).mockResolvedValue(PROJETO as any)
    await expect(assertProjectAccessById('p1', 'x1')).rejects.toThrow(/Acesso negado/)
  })

  it('não lança para participante', async () => {
    vi.mocked(prisma.projeto.findUnique).mockResolvedValue(PROJETO as any)
    await expect(assertProjectAccessById('p1', 'd1')).resolves.toBeUndefined()
  })
})
