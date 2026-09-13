import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  const mock = criarPrismaMock()
  return { default: mock, prisma: mock }
})

import prisma from '../../src/database/client.js'
import { contarRodadas, rodadasDaArte } from '../../src/services/rodadasService.js'

const db = prisma as any
const ARTE = 'ca00000000000000000000001'
const CLIENTE = 'cc00000000000000000000001'

beforeEach(() => vi.clearAllMocks())

/**
 * A cláusula 3.2 já definia a conta: "o conjunto de feedbacks do Cliente sobre
 * uma mesma versão de uma entrega, consolidado até a próxima versão". O dado
 * existia desde que `versaoNumero` passou a ser carimbado pelo servidor.
 * Faltava alguém somar — e sem a soma as duas partes combinam "3 rodadas" e
 * nenhuma consegue dizer em qual está.
 */
describe('a conta de rodadas da cláusula 3.2', () => {
  it('vários comentários na mesma versão são UMA rodada', () => {
    // É o ponto inteiro da cláusula: a rodada é o conjunto, não o comentário.
    const r = contarRodadas([{ versaoNumero: 1 }, { versaoNumero: 1 }, { versaoNumero: 1 }], 3)
    expect(r.usadas).toBe(1)
  })

  it('versões diferentes são rodadas diferentes', () => {
    const r = contarRodadas([{ versaoNumero: 1 }, { versaoNumero: 2 }], 3)
    expect(r.usadas).toBe(2)
    expect(r.versoes).toEqual([1, 2])
  })

  it('nenhum comentário do cliente é zero rodada', () => {
    expect(contarRodadas([], 3).usadas).toBe(0)
  })

  it('as versões saem ordenadas, não na ordem em que os comentários chegaram', () => {
    // A tela lista "v1, v2, v3"; a ordem de chegada não é a ordem da história.
    const r = contarRodadas([{ versaoNumero: 3 }, { versaoNumero: 1 }, { versaoNumero: 2 }], null)
    expect(r.versoes).toEqual([1, 2, 3])
  })

  it('comentário sem versão não vira rodada — fica declarado à parte', () => {
    /*
     * Legado, anterior ao carimbo. Atribuir por proximidade de data produziria
     * um palpite indistinguível de um registro, e este número é argumento em
     * disputa. Conta que se declara incompleta vale mais que número redondo
     * indefensável.
     */
    const r = contarRodadas([{ versaoNumero: null }, { versaoNumero: null }, { versaoNumero: 2 }], 3)
    expect(r.usadas).toBe(1)
    expect(r.semVersao).toBe(2)
  })

  it('sem termos combinados, conta o usado e não inventa um teto', () => {
    const r = contarRodadas([{ versaoNumero: 1 }], null)
    expect(r.usadas).toBe(1)
    expect(r.incluidas).toBeNull()
  })

  it('zero rodadas incluídas é um acordo, não ausência de acordo', () => {
    // "Nenhuma revisão inclusa" é combinável — e aí a primeira já é extra.
    const r = contarRodadas([{ versaoNumero: 1 }], 0)
    expect(r.incluidas).toBe(0)
    expect(r.usadas).toBe(1)
  })

  it('estourar o combinado é um fato relatado, não um erro', () => {
    // Quem decide o que fazer com a 4ª de 3 é o designer, cobrando pela 3.3.
    const r = contarRodadas([1, 2, 3, 4].map((versaoNumero) => ({ versaoNumero })), 3)
    expect(r.usadas).toBe(4)
    expect(r.incluidas).toBe(3)
  })
})

describe('de quem são os comentários que contam', () => {
  function arteComCliente(rodadasIncluidas: number | null = 3) {
    db.arte.findUnique.mockResolvedValue({
      projeto: { clienteId: CLIENTE, termos: { rodadasIncluidas } },
    })
    db.feedback.findMany.mockResolvedValue([{ versaoNumero: 1 }])
  }

  it('só o cliente gasta rodada', async () => {
    /*
     * Comentário do próprio designer, da equipe dele ou de um admin é anotação
     * de trabalho, não pedido de revisão. Contá-lo gastaria uma rodada que o
     * cliente não pediu — e é o designer quem perde, porque chega antes ao
     * limite que ele mesmo vendeu.
     */
    arteComCliente()
    await rodadasDaArte(ARTE)

    expect(db.feedback.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { arteId: ARTE, autorId: CLIENTE } }),
    )
  })

  it('lê o teto dos termos do projeto, não de uma constante', async () => {
    arteComCliente(5)
    const r = await rodadasDaArte(ARTE)
    expect(r?.incluidas).toBe(5)
  })

  it('projeto sem termos devolve teto nulo em vez de quebrar', async () => {
    db.arte.findUnique.mockResolvedValue({ projeto: { clienteId: CLIENTE, termos: null } })
    db.feedback.findMany.mockResolvedValue([])
    const r = await rodadasDaArte(ARTE)
    expect(r?.incluidas).toBeNull()
  })

  it('arte inexistente devolve nulo, sem consultar feedback', async () => {
    db.arte.findUnique.mockResolvedValue(null)
    expect(await rodadasDaArte(ARTE)).toBeNull()
    expect(db.feedback.findMany).not.toHaveBeenCalled()
  })
})
