import { describe, it, expect } from 'vitest'
import { contarFunil } from '../../src/services/funilService.js'

/**
 * O funil precisa afunilar: cada etapa é subconjunto da anterior. Se
 * "comentadas" contasse arte que ninguém abriu, o número diria que o cliente
 * fala sem ver — e a conclusão que se tira disso manda o designer resolver o
 * problema errado.
 */

const CLIENTE = 'c1'

function arte(over: Partial<Parameters<typeof contarFunil>[0][number]> = {}) {
  return {
    clienteId: CLIENTE,
    acessos: [0],
    autoresDeFeedback: [] as string[],
    aprovacoes: [] as { status: string; criadoEm: Date; decididoEm: Date | null }[],
    ...over,
  }
}

describe('contarFunil', () => {
  it('sem nada compartilhado, todas as etapas são zero', () => {
    expect(contarFunil([])).toEqual({
      compartilhadas: 0,
      abertas: 0,
      comentadas: 0,
      decididas: 0,
      medianaDiasAteDecidir: null,
    })
  })

  it('conta como aberta a arte cujo link teve ao menos um acesso', () => {
    const f = contarFunil([arte({ acessos: [0] }), arte({ acessos: [0, 3] })])
    expect(f.compartilhadas).toBe(2)
    expect(f.abertas).toBe(1)
  })

  it('comentário do designer não conta como o cliente ter falado', () => {
    const f = contarFunil([
      arte({ acessos: [1], autoresDeFeedback: ['designer-1'] }),
      arte({ acessos: [1], autoresDeFeedback: ['designer-1', CLIENTE] }),
    ])
    expect(f.abertas).toBe(2)
    expect(f.comentadas).toBe(1)
  })

  it('aprovação pendente não é decisão', () => {
    const f = contarFunil([
      arte({
        acessos: [1],
        aprovacoes: [{ status: 'PENDENTE', criadoEm: new Date(), decididoEm: null }],
      }),
    ])
    expect(f.decididas).toBe(0)
  })

  it('recusa também é decisão — o cliente respondeu', () => {
    const f = contarFunil([
      arte({
        acessos: [1],
        aprovacoes: [
          { status: 'REJEITADO', criadoEm: new Date('2026-01-01'), decididoEm: new Date('2026-01-03') },
        ],
      }),
    ])
    expect(f.decididas).toBe(1)
  })

  it('não conta como decidida a arte que ninguém abriu', () => {
    // Decisão sem abertura existe no banco (o designer registra fora do link),
    // mas contá-la aqui faria a etapa de baixo ser maior que a de cima.
    const f = contarFunil([
      arte({
        acessos: [0],
        aprovacoes: [
          { status: 'APROVADO', criadoEm: new Date('2026-01-01'), decididoEm: new Date('2026-01-02') },
        ],
      }),
    ])
    expect(f.abertas).toBe(0)
    expect(f.decididas).toBe(0)
  })

  it('usa mediana e não média — um cliente que sumiu não vira a régua', () => {
    const d = (dias: number) => ({
      status: 'APROVADO',
      criadoEm: new Date('2026-01-01T00:00:00Z'),
      decididoEm: new Date(new Date('2026-01-01T00:00:00Z').getTime() + dias * 86400000),
    })
    const f = contarFunil([
      arte({ acessos: [1], aprovacoes: [d(1)] }),
      arte({ acessos: [1], aprovacoes: [d(2)] }),
      arte({ acessos: [1], aprovacoes: [d(60)] }),
    ])
    expect(f.medianaDiasAteDecidir).toBe(2)
  })

  it('com número par de decisões, a mediana fica entre as duas do meio', () => {
    const d = (dias: number) => ({
      status: 'APROVADO',
      criadoEm: new Date('2026-01-01T00:00:00Z'),
      decididoEm: new Date(new Date('2026-01-01T00:00:00Z').getTime() + dias * 86400000),
    })
    const f = contarFunil([
      arte({ acessos: [1], aprovacoes: [d(1)] }),
      arte({ acessos: [1], aprovacoes: [d(2)] }),
      arte({ acessos: [1], aprovacoes: [d(4)] }),
      arte({ acessos: [1], aprovacoes: [d(5)] }),
    ])
    expect(f.medianaDiasAteDecidir).toBe(3)
  })

  it('sem nenhuma decisão fechada, não inventa prazo', () => {
    const f = contarFunil([
      arte({ acessos: [1], aprovacoes: [{ status: 'PENDENTE', criadoEm: new Date(), decididoEm: null }] }),
    ])
    expect(f.medianaDiasAteDecidir).toBeNull()
  })
})
