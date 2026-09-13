import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  const mock = criarPrismaMock()
  return { default: mock, prisma: mock }
})

import { prisma } from '../../src/database/client.js'
import {
  TermosProjetoService,
  camposFaltantes,
  termosCompletos,
  CAMPOS_OBRIGATORIOS,
} from '../../src/services/termosProjetoService.js'
import { renderizarAnexo } from '../../src/templates/anexoRevisao.js'

const service = new TermosProjetoService()
const db = prisma as any

const DESIGNER = 'cd0000000000000000000001'
const CLIENTE = 'cc0000000000000000000001'
const PROJETO = 'cp0000000000000000000001'

/** Um conjunto de termos que está completo — a base dos casos negativos. */
function termosCompletosFixture(extra: Record<string, unknown> = {}) {
  return {
    id: 't1',
    projetoId: PROJETO,
    rodadasIncluidas: 3,
    prazoRevisaoDiasUteis: 5,
    licencaFinalidade: 'Redes sociais e material impresso institucional',
    licencaTerritorio: 'Brasil',
    licencaPrazo: 'INDETERMINADO',
    licencaPrazoAte: null,
    exclusividade: false,
    exclusividadeAte: null,
    arquivosFonte: 'INCLUSOS_APOS_QUITACAO',
    criadoEm: new Date(),
    atualizadoEm: new Date(),
    ...extra,
  } as any
}

beforeEach(() => vi.clearAllMocks())

/**
 * `camposFaltantes` é a única fonte da pergunta "dá para gerar o contrato?".
 * O aviso da tela de fatura e o portão leem daqui; se cada um mantivesse a
 * própria lista, elas divergiriam no primeiro campo novo — e o aviso diria
 * "tudo certo" enquanto o portão recusasse.
 */
describe('o que ainda falta combinar', () => {
  it('sem linha de termos, falta tudo', () => {
    expect(camposFaltantes(null)).toEqual([...CAMPOS_OBRIGATORIOS])
    expect(termosCompletos(null)).toBe(false)
  })

  it('com tudo preenchido, não falta nada', () => {
    expect(camposFaltantes(termosCompletosFixture())).toEqual([])
    expect(termosCompletos(termosCompletosFixture())).toBe(true)
  })

  it('aponta exatamente o campo que falta, não um "incompleto" genérico', () => {
    const semTerritorio = termosCompletosFixture({ licencaTerritorio: null })
    expect(camposFaltantes(semTerritorio)).toEqual(['licencaTerritorio'])
  })

  /*
   * O motivo de `exclusividade` ser `Boolean?` e não ter default: com
   * `@default(false)`, "respondeu que não" e "ninguém respondeu" ficariam
   * indistinguíveis, e o aviso nunca apareceria para quem esqueceu o campo.
   */
  it('distingue "respondeu que não" de "não respondeu" na exclusividade', () => {
    expect(camposFaltantes(termosCompletosFixture({ exclusividade: false }))).toEqual([])
    expect(camposFaltantes(termosCompletosFixture({ exclusividade: null }))).toEqual(['exclusividade'])
  })

  it('rodadas zero é um acordo, não um campo em branco', () => {
    // "Nenhuma revisão inclusa" é combinável. Se `0` contasse como faltando,
    // esse acordo seria impossível de registrar.
    expect(camposFaltantes(termosCompletosFixture({ rodadasIncluidas: 0 }))).toEqual([])
  })

  it('prazo ATE_DATA sem a data conta como incompleto', () => {
    // Senão a cláusula 7.2 sai dizendo "vale até —".
    const t = termosCompletosFixture({ licencaPrazo: 'ATE_DATA', licencaPrazoAte: null })
    expect(camposFaltantes(t)).toContain('licencaPrazo')
  })

  it('exclusividade sim sem prazo conta como incompleto', () => {
    // Exclusividade sem fim é cessão disfarçada de licença.
    const t = termosCompletosFixture({ exclusividade: true, exclusividadeAte: null })
    expect(camposFaltantes(t)).toContain('exclusividade')
  })
})

describe('quem pode definir os termos', () => {
  function projetoOk() {
    db.projeto.findUnique.mockResolvedValue({
      id: PROJETO, nome: 'Site', designerId: DESIGNER, clienteId: CLIENTE,
    })
    db.termosProjeto.upsert.mockResolvedValue(termosCompletosFixture())
  }

  it('o designer do projeto define', async () => {
    projetoOk()
    db.usuario.findUnique.mockResolvedValue({ id: DESIGNER, tipo: 'DESIGNER' })
    await expect(service.salvarTermos(PROJETO, DESIGNER, { rodadasIncluidas: 3 })).resolves.toBeTruthy()
  })

  it('o cliente não define — ele lê e aceita', async () => {
    // Mesma regra de `criarFatura`: é decisão de quem cobra, sob quais
    // condições. Se a tela oferecesse ao cliente, seria mais um botão que
    // devolve 403.
    projetoOk()
    db.usuario.findUnique.mockResolvedValue({ id: CLIENTE, tipo: 'CLIENTE' })
    await expect(service.salvarTermos(PROJETO, CLIENTE, { rodadasIncluidas: 3 })).rejects.toThrow(
      'Apenas o designer do projeto pode definir os termos',
    )
  })

  it('o ADMIN define em nome do designer', async () => {
    projetoOk()
    db.usuario.findUnique.mockResolvedValue({ id: 'cadmin', tipo: 'ADMIN' })
    await expect(service.salvarTermos(PROJETO, 'cadmin', { rodadasIncluidas: 3 })).resolves.toBeTruthy()
  })

  it('projeto inexistente não vira linha de termos órfã', async () => {
    db.projeto.findUnique.mockResolvedValue(null)
    await expect(service.salvarTermos(PROJETO, DESIGNER, {})).rejects.toThrow('Projeto não encontrado')
    expect(db.termosProjeto.upsert).not.toHaveBeenCalled()
  })

  /*
   * Salvar aos poucos é o uso normal: combina prazo hoje, licença amanhã.
   * Se um campo ausente virasse `null` no banco, salvar as rodadas apagaria
   * o território que já estava lá.
   */
  it('salvar um campo não apaga os outros', async () => {
    projetoOk()
    db.usuario.findUnique.mockResolvedValue({ id: DESIGNER, tipo: 'DESIGNER' })
    await service.salvarTermos(PROJETO, DESIGNER, { rodadasIncluidas: 3 })

    const args = db.termosProjeto.upsert.mock.calls[0][0]
    expect(args.update).toEqual({ rodadasIncluidas: 3 })
    expect(args.update).not.toHaveProperty('licencaTerritorio')
  })

  it('mandar null explicitamente limpa o campo', async () => {
    // Diferente de omitir: é a pessoa apagando o que havia escrito.
    projetoOk()
    db.usuario.findUnique.mockResolvedValue({ id: DESIGNER, tipo: 'DESIGNER' })
    await service.salvarTermos(PROJETO, DESIGNER, { licencaTerritorio: null })

    const args = db.termosProjeto.upsert.mock.calls[0][0]
    expect(args.update).toEqual({ licencaTerritorio: null })
  })
})

/**
 * O texto do anexo vira `ContratoProjeto.texto` e o sha256 dele vira o `hash`.
 * Se a renderização não for determinística, o hash muda sozinho e a prova de
 * que o texto não foi alterado deixa de valer.
 */
describe('o anexo renderizado', () => {
  const dados = {
    partes: {
      designer: { id: DESIGNER, nome: 'Ana Silva', email: 'ana@t.com' },
      cliente: { id: CLIENTE, nome: 'João Santos', email: 'joao@t.com' },
    },
    projeto: {
      id: PROJETO,
      nome: 'App FitTracker',
      descricao: null,
      orcamentoCentavos: 1_200_000,
      prazo: '2026-11-30T00:00:00.000Z',
    },
    termos: {
      rodadasIncluidas: 3,
      prazoRevisaoDiasUteis: 5,
      licencaFinalidade: 'Redes sociais',
      licencaTerritorio: 'Brasil',
      licencaPrazo: 'INDETERMINADO',
      licencaPrazoAte: null,
      exclusividade: false,
      exclusividadeAte: null,
      arquivosFonte: 'INCLUSOS_APOS_QUITACAO',
    },
    geradoEm: '2026-09-13T02:00:00.000Z',
  }

  it('é determinístico — a mesma entrada dá exatamente os mesmos bytes', () => {
    expect(renderizarAnexo(dados)).toBe(renderizarAnexo(dados))
  })

  it('traz os termos preenchidos, não as lacunas', () => {
    const texto = renderizarAnexo(dados)
    // POR ENTREGA, e não pelo projeto somado: a @1 era ambígua aqui, e a
    // ambiguidade caía sobre o número que se discute numa disputa.
    expect(texto).toContain('3 rodadas de revisão POR')
    expect(texto).toContain('cada peça registrada individualmente no VIU')
    expect(texto).toContain('5 dias úteis')
    expect(texto).toContain('Redes sociais')
    // `formatCurrency` usa Intl, que separa com espaço não-quebrável (U+00A0).
    // Comparar com espaço comum falharia por um caractere invisível.
    expect(texto).toContain(`R$\u00a012.000,00`)
  })

  it('não oferece aprovação tácita — a Opção B saiu do template', () => {
    const texto = renderizarAnexo(dados)
    expect(texto).toContain('Sem aprovação tácita')
    expect(texto).not.toMatch(/ser[áa] considerada aprovada/i)
  })

  it('avisa que o texto ainda não passou por advogado', () => {
    expect(renderizarAnexo(dados)).toContain('PENDENTE DE REVISÃO JURÍDICA')
  })

  it('a cláusula 7.1 amarra a propriedade à quitação', () => {
    // É a única cláusula que o VIU consegue fazer valer sozinho, porque é o
    // único que sabe se a fatura foi paga.
    expect(renderizarAnexo(dados)).toContain('quitação integral')
  })

  it('termo faltando vira travessão, não a palavra "null" na cara do cliente', () => {
    const vazio = { ...dados, termos: { ...dados.termos, licencaTerritorio: null } }
    const texto = renderizarAnexo(vazio)
    expect(texto).not.toContain('null')
    expect(texto).not.toContain('undefined')
  })

  it('prazo até uma data aparece com a data, não com o enum', () => {
    const comData = {
      ...dados,
      termos: { ...dados.termos, licencaPrazo: 'ATE_DATA', licencaPrazoAte: '2027-03-13T00:00:00.000Z' },
    }
    const texto = renderizarAnexo(comData)
    expect(texto).toContain('até 13/03/2027')
    expect(texto).not.toContain('ATE_DATA')
  })

  /*
   * Texto puro, não markdown: o hash cobre exatamente o que a pessoa leu. Um
   * `**` ou `|---|` na tela significaria que ela concordou com o renderizado
   * enquanto o hash guardava o fonte.
   */
  it('não vaza sintaxe de markdown para a tela', () => {
    const texto = renderizarAnexo(dados)
    expect(texto).not.toContain('**')
    expect(texto).not.toContain('|---')
    expect(texto).not.toMatch(/^#+ /m)
  })

  it('arquivos-fonte vira frase, não constante de banco', () => {
    const texto = renderizarAnexo(dados)
    expect(texto).toContain('estão inclusos após a quitação integral')
    expect(texto).not.toContain('INCLUSOS_APOS_QUITACAO')
  })
})
