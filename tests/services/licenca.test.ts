import { describe, it, expect } from 'vitest'
import { estadoDaLicenca, licencaPublica } from '../../src/services/licencaService.js'

/**
 * A cláusula 7.1 do anexo — "os direitos permanecem do Designer até a quitação
 * integral" — virando estado computável.
 *
 * É a única cláusula que o VIU consegue fazer valer sozinho, porque é o único
 * que sabe se a fatura foi paga. Errar aqui significa uma peça aparecer como
 * liberada para uso sem ter sido paga, ou o contrário: um cliente adimplente
 * lendo que o uso dele não está licenciado.
 */

const PAGA = (dataPagamento: Date | null = new Date('2026-09-13T10:00:00.000Z')) => ({
  status: 'PAGA',
  dataPagamento,
})
const PENDENTE = { status: 'PENDENTE', dataPagamento: null }
const CANCELADA = { status: 'CANCELADA', dataPagamento: null }
const ESTORNADA = { status: 'ESTORNADA', dataPagamento: new Date('2026-09-01T10:00:00.000Z') }

describe('quando a licença está vigente', () => {
  it('fatura paga libera o uso e diz desde quando', () => {
    const l = estadoDaLicenca([PAGA()])
    expect(l.estado).toBe('QUITADO')
    expect(l.quitadoEm).toBe('2026-09-13T10:00:00.000Z')
  })

  it('paga sem data de pagamento ainda é quitada', () => {
    // A data alimenta a frase ("licença vigente desde…"); a ausência dela não
    // pode transformar um projeto pago em não licenciado.
    const l = estadoDaLicenca([PAGA(null)])
    expect(l.estado).toBe('QUITADO')
    expect(l.quitadoEm).toBeNull()
  })
})

describe('quando não está', () => {
  it('fatura pendente deixa o uso sem licença', () => {
    expect(estadoDaLicenca([PENDENTE]).estado).toBe('EM_ABERTO')
  })

  /*
   * Estorno devolve o dinheiro e derruba a premissa da cláusula. Não há rota de
   * estorno no produto, mas o webhook do Mercado Pago marca ESTORNADA em
   * `refunded` e `charged_back` — então este caso chega sozinho.
   */
  it('estorno derruba a licença em vez de cair no silêncio', () => {
    expect(estadoDaLicenca([ESTORNADA]).estado).toBe('ESTORNADO')
  })

  it('estornada não guarda data de quitação — ela deixou de valer', () => {
    expect(estadoDaLicenca([ESTORNADA]).quitadoEm).toBeNull()
  })
})

describe('quando o selo não deve aparecer', () => {
  it('projeto sem fatura nenhuma', () => {
    // Rotular toda peça sem cobrança como "não licenciada" seria editorializar
    // onde não há fato: cortesia, projeto interno e trabalho ainda não faturado
    // cairiam todos no mesmo aviso.
    expect(estadoDaLicenca([]).estado).toBe('NAO_FATURADO')
  })

  it('só faturas canceladas', () => {
    expect(estadoDaLicenca([CANCELADA, CANCELADA]).estado).toBe('NAO_FATURADO')
  })
})

describe('a precedência entre faturas do mesmo projeto', () => {
  /*
   * O índice `faturas_uma_ativa_por_projeto` garante no máximo uma PENDENTE ou
   * PAGA por projeto, mas CANCELADA e ESTORNADA se acumulam — então as
   * combinações abaixo existem de verdade no banco.
   */
  it('uma paga vence canceladas antigas', () => {
    expect(estadoDaLicenca([CANCELADA, PAGA(), CANCELADA]).estado).toBe('QUITADO')
  })

  it('uma pendente nova vence um estorno antigo', () => {
    // O designer estornou e emitiu outra cobrança: o que vale é a viva.
    expect(estadoDaLicenca([ESTORNADA, PENDENTE]).estado).toBe('EM_ABERTO')
  })

  it('uma paga nova vence um estorno antigo', () => {
    expect(estadoDaLicenca([ESTORNADA, PAGA()]).estado).toBe('QUITADO')
  })

  it('a ordem da lista não muda o resultado', () => {
    // O `findMany` não garante ordem sem `orderBy`, e a regra não pode depender
    // de sorte de índice.
    const a = estadoDaLicenca([ESTORNADA, CANCELADA, PAGA()])
    const b = estadoDaLicenca([PAGA(), CANCELADA, ESTORNADA])
    expect(a).toEqual(b)
  })
})

describe('formatos que o banco devolve', () => {
  it('aceita data como string, não só como Date', () => {
    // O Prisma devolve Date, mas a mesma função é usada sobre payload já
    // serializado em teste e em cache.
    const l = estadoDaLicenca([{ status: 'PAGA', dataPagamento: '2026-09-13T10:00:00.000Z' }])
    expect(l.quitadoEm).toBe('2026-09-13T10:00:00.000Z')
  })

  it('status desconhecido não vira licença vigente', () => {
    // Se um status novo aparecer no banco, o padrão seguro é não liberar o uso.
    expect(estadoDaLicenca([{ status: 'INVENTADO', dataPagamento: null }]).estado).toBe(
      'NAO_FATURADO',
    )
  })
})

/**
 * O selo nasceu certo na intenção e errado no alcance: no link público ele
 * contava a data da quitação e, pior, que o pagamento tinha sido estornado.
 *
 * Link é encaminhado — para o chefe do cliente, para o aprovador interno, para
 * um fornecedor. Nenhum deles pediu para saber se houve briga de dinheiro.
 */
describe('a licença que pode sair no link público', () => {
  it('não conta QUANDO foi quitado', () => {
    const dentro = estadoDaLicenca([PAGA()])
    expect(dentro.quitadoEm).not.toBeNull()
    expect(licencaPublica(dentro).quitadoEm).toBeNull()
  })

  it('licenciado continua licenciado — a resposta útil não se perde', () => {
    expect(licencaPublica(estadoDaLicenca([PAGA()])).estado).toBe('QUITADO')
  })

  it('estorno não vaza: vira "não licenciado", igual a não ter pago', () => {
    // As duas maneiras de não poder usar são a mesma resposta para quem abriu o
    // link; a diferença entre elas é assunto das partes.
    expect(licencaPublica(estadoDaLicenca([ESTORNADA])).estado).toBe('EM_ABERTO')
  })

  it('nenhum estado público revela estorno', () => {
    const todos = [
      estadoDaLicenca([PAGA()]),
      estadoDaLicenca([PENDENTE]),
      estadoDaLicenca([ESTORNADA]),
      estadoDaLicenca([]),
    ]
    for (const l of todos) {
      expect(licencaPublica(l).estado).not.toBe('ESTORNADO')
    }
  })

  it('sem fatura segue sem selo', () => {
    // Rotular peça não faturada como "não licenciada" seria editorializar.
    expect(licencaPublica(estadoDaLicenca([])).estado).toBe('NAO_FATURADO')
  })

  it('nenhuma data sobrevive à redução, em nenhum estado', () => {
    const todos = [PAGA(), PENDENTE, ESTORNADA].map((f) => estadoDaLicenca([f]))
    for (const l of todos) {
      expect(licencaPublica(l).quitadoEm).toBeNull()
    }
  })
})
