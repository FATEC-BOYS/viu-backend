import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  return { default: criarPrismaMock() }
})

import prisma from '../../src/database/client.js'
import { listarFaturas } from '../../src/services/faturaService.js'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.fatura.findMany).mockResolvedValue([] as any)
})

/*
 * O modal de disputa precisa perguntar QUAL fatura está em jogo, e a pergunta
 * só faz sentido sobre as faturas daquele projeto. Filtrar no navegador uma
 * lista que chega inteira esconderia as faturas que não couberam nela — o
 * mesmo defeito que /notificacoes tinha com o `?limit=100` fixo.
 */
describe('Faturas de um projeto', () => {
  it('filtra por projeto no banco, sem largar o recorte por participante', async () => {
    await listarFaturas('designer1', 'designer', 'proj1')

    const { where } = vi.mocked(prisma.fatura.findMany).mock.calls[0][0] as any
    expect(where).toEqual({ designerId: 'designer1', projetoId: 'proj1' })
  })

  it('continua devolvendo tudo quando nenhum projeto é pedido', async () => {
    await listarFaturas('cliente1', 'cliente')

    const { where } = vi.mocked(prisma.fatura.findMany).mock.calls[0][0] as any
    expect(where).toEqual({ clienteId: 'cliente1' })
  })

  /*
   * O recorte por lado continua mandando: pedir o projeto não pode virar uma
   * porta para ver fatura de quem não é você.
   */
  it('não deixa o cliente enxergar o projeto pelo lado do designer', async () => {
    await listarFaturas('cliente1', 'cliente', 'proj1')

    const { where } = vi.mocked(prisma.fatura.findMany).mock.calls[0][0] as any
    expect(where.clienteId).toBe('cliente1')
    expect(where.designerId).toBeUndefined()
  })
})
