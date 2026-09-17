import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  const mock = criarPrismaMock()
  return { default: mock, prisma: mock }
})

import { prisma } from '../../src/database/client.js'
import {
  ContratoProjetoService,
  hashDoTexto,
  mesmoAcordo,
  montarDados,
  TERMOS_INCOMPLETOS,
} from '../../src/services/contratoProjetoService.js'
import { renderizarAnexo, TEMPLATE_VERSAO } from '../../src/templates/anexoRevisao.js'

const service = new ContratoProjetoService()
const db = prisma as any

const DESIGNER = 'cd0000000000000000000001'
const CLIENTE = 'cc0000000000000000000001'
const PROJETO = 'cp0000000000000000000001'

const TERMOS = {
  rodadasIncluidas: 3,
  prazoRevisaoDiasUteis: 5,
  licencaFinalidade: 'Redes sociais',
  licencaTerritorio: 'Brasil',
  licencaPrazo: 'INDETERMINADO',
  licencaPrazoAte: null,
  exclusividade: false,
  exclusividadeAte: null,
  arquivosFonte: 'INCLUSOS_APOS_QUITACAO',
}

const PROJETO_COMPLETO = {
  id: PROJETO,
  nome: 'Site',
  descricao: null,
  orcamento: 1_200_000,
  prazo: null,
  designerId: DESIGNER,
  clienteId: CLIENTE,
  designer: { id: DESIGNER, nome: 'Ana Silva', email: 'ana@t.com' },
  cliente: { id: CLIENTE, nome: 'João Santos', email: 'joao@t.com' },
  termos: TERMOS,
}

function projetoPronto(extra: Record<string, unknown> = {}) {
  db.projeto.findUnique.mockResolvedValue({ ...PROJETO_COMPLETO, ...extra })
  db.usuario.findUnique.mockResolvedValue({ id: DESIGNER, tipo: 'DESIGNER' })
  db.contratoProjeto.findFirst.mockResolvedValue(null)
  db.contratoProjeto.updateMany.mockResolvedValue({ count: 0 })
  db.contratoProjeto.create.mockImplementation(async (args: any) => ({ id: 'ccontrato1', ...args.data }))
}

beforeEach(() => vi.clearAllMocks())

describe('gerar o contrato', () => {
  it('congela o texto e o hash dele', async () => {
    projetoPronto()
    const c: any = await service.gerar(PROJETO, DESIGNER)

    expect(c.versao).toBe(1)
    expect(c.status).toBe('VIGENTE')
    expect(c.hash).toBe(hashDoTexto(c.texto))
    expect(c.templateVersao).toBe(TEMPLATE_VERSAO)
  })

  /*
   * O snapshot é o que separa contrato de consulta. Sem ele, o texto seria
   * re-renderizado do projeto e mudaria junto com `orcamento` e os termos — em
   * silêncio, depois de aceito.
   */
  it('guarda os dados que produziram o texto, congelados', async () => {
    projetoPronto()
    const c: any = await service.gerar(PROJETO, DESIGNER)

    expect(c.dados.partes.designer.nome).toBe('Ana Silva')
    expect(c.dados.projeto.orcamentoCentavos).toBe(1_200_000)
    expect(c.dados.termos.rodadasIncluidas).toBe(3)
  })

  it('registra que o texto ainda não passou por advogado', async () => {
    projetoPronto()
    const c: any = await service.gerar(PROJETO, DESIGNER)
    // Gravado, e não derivado do template de hoje: a pergunta é sobre o momento
    // do aceite, não sobre agora.
    expect(c.revisadoJuridicamente).toBe(false)
  })

  it('recusa com termos incompletos', async () => {
    // Um anexo cheio de travessões não protege ninguém e ainda dá a impressão
    // de que há acordo onde não há.
    projetoPronto({ termos: { ...TERMOS, licencaTerritorio: null } })
    await expect(service.gerar(PROJETO, DESIGNER)).rejects.toThrow(TERMOS_INCOMPLETOS)
    expect(db.contratoProjeto.create).not.toHaveBeenCalled()
  })

  it('recusa quem não é o designer', async () => {
    projetoPronto()
    db.usuario.findUnique.mockResolvedValue({ id: CLIENTE, tipo: 'CLIENTE' })
    await expect(service.gerar(PROJETO, CLIENTE)).rejects.toThrow('Apenas o designer')
  })

  it('o ADMIN gera em nome do designer', async () => {
    projetoPronto()
    db.usuario.findUnique.mockResolvedValue({ id: 'cadmin', tipo: 'ADMIN' })
    await expect(service.gerar(PROJETO, 'cadmin')).resolves.toBeTruthy()
  })
})

describe('a próxima versão', () => {
  it('numera a partir da última, não do total vigente', async () => {
    projetoPronto()
    db.contratoProjeto.findFirst.mockResolvedValue({ versao: 4, hash: 'outro' })
    const c: any = await service.gerar(PROJETO, DESIGNER)
    expect(c.versao).toBe(5)
  })

  it('substitui a anterior antes de a nova entrar', async () => {
    // Dois contratos vigentes no mesmo projeto não teriam como ser desempatados
    // depois.
    projetoPronto()
    db.contratoProjeto.findFirst.mockResolvedValue({ versao: 1, hash: 'outro' })
    await service.gerar(PROJETO, DESIGNER)

    expect(db.contratoProjeto.updateMany).toHaveBeenCalledWith({
      where: { projetoId: PROJETO, status: 'VIGENTE' },
      data: { status: 'SUBSTITUIDO' },
    })
  })

  /*
   * Sem isto, clicar duas vezes em "gerar" criaria a v2 idêntica à v1 e
   * invalidaria os aceites da v1 sem que nada tivesse mudado — as duas partes
   * teriam que reaceitar exatamente o mesmo documento.
   */
  it('texto idêntico ao vigente não vira versão nova', async () => {
    projetoPronto()
    const geradoEm = new Date()
    const texto = renderizarAnexo(montarDados(PROJETO_COMPLETO as any, geradoEm))

    const vigente = { id: 'ccontrato1', versao: 1, hash: hashDoTexto(texto), aceites: [] }
    db.contratoProjeto.findFirst.mockResolvedValue(vigente)

    // `geradoEm` entra no texto, então o hash só bate se a data coincidir — o
    // teste força isso congelando o relógio.
    vi.useFakeTimers()
    vi.setSystemTime(geradoEm)
    const c: any = await service.gerar(PROJETO, DESIGNER)
    vi.useRealTimers()

    expect(c.id).toBe('ccontrato1')
    expect(db.contratoProjeto.create).not.toHaveBeenCalled()
  })
})

describe('o aceite', () => {
  const CONTRATO = {
    id: 'ccontrato1',
    projetoId: PROJETO,
    status: 'VIGENTE',
    hash: 'abc123',
    templateVersao: TEMPLATE_VERSAO,
    projeto: { designerId: DESIGNER, clienteId: CLIENTE },
  }

  function contratoVigente(extra: Record<string, unknown> = {}) {
    db.contratoProjeto.findUnique.mockResolvedValue({ ...CONTRATO, ...extra })
    db.aceiteContratual.findFirst.mockResolvedValue(null)
    db.aceiteContratual.create.mockImplementation(async (a: any) => ({ id: 'caceite1', ...a.data }))
  }

  it('grava o papel de quem aceitou', async () => {
    contratoVigente()
    const a: any = await service.aceitar('ccontrato1', CLIENTE, { ip: '1.2.3.4' })
    expect(a.papel).toBe('CLIENTE')
    expect(a.contratoId).toBe('ccontrato1')
  })

  /*
   * Redundante com `contrato.hash` de propósito: se a linha do contrato for
   * alterada depois, o aceite carrega a própria cópia do que foi acordado.
   */
  it('guarda o hash que estava na tela naquele clique', async () => {
    contratoVigente()
    const a: any = await service.aceitar('ccontrato1', CLIENTE, {})
    expect(a.hashAceito).toBe('abc123')
  })

  it('guarda IP e user-agent, que é o que prova quando e de onde', async () => {
    contratoVigente()
    const a: any = await service.aceitar('ccontrato1', DESIGNER, {
      ip: '9.9.9.9',
      userAgent: 'Mozilla/5.0',
    })
    expect(a.ip).toBe('9.9.9.9')
    expect(a.userAgent).toBe('Mozilla/5.0')
  })

  /*
   * O conserto central deste passo. O serviço antigo era `upsert` com `update`:
   * aceitar de novo sobrescrevia a linha e apagava a prova do aceite anterior.
   */
  it('nunca atualiza uma linha de aceite existente', async () => {
    contratoVigente()
    await service.aceitar('ccontrato1', CLIENTE, {})
    expect(db.aceiteContratual.update).not.toHaveBeenCalled()
    expect(db.aceiteContratual.upsert).not.toHaveBeenCalled()
  })

  it('aceitar duas vezes devolve o mesmo aceite, sem duplicar', async () => {
    db.contratoProjeto.findUnique.mockResolvedValue(CONTRATO)
    db.aceiteContratual.findFirst.mockResolvedValue({ id: 'caceite1', contratoId: 'ccontrato1' })

    const a: any = await service.aceitar('ccontrato1', CLIENTE, {})
    expect(a.id).toBe('caceite1')
    expect(db.aceiteContratual.create).not.toHaveBeenCalled()
  })

  it('um terceiro com o id do contrato não vira signatário', async () => {
    contratoVigente()
    await expect(service.aceitar('ccontrato1', 'cestranho', {})).rejects.toThrow('Acesso negado')
  })

  it('não se aceita versão já substituída', async () => {
    // Registraria concordância com um texto que não rege mais nada, e depois
    // ninguém saberia dizer se a pessoa concordou com o acordo atual.
    contratoVigente({ status: 'SUBSTITUIDO' })
    await expect(service.aceitar('ccontrato1', CLIENTE, {})).rejects.toThrow('não é mais a vigente')
  })
})

describe('de quem se está esperando', () => {
  it('sem contrato, faltam os dois', async () => {
    db.projeto.findUnique.mockResolvedValue({ designerId: DESIGNER, clienteId: CLIENTE })
    db.contratoProjeto.findFirst.mockResolvedValue(null)

    const e = await service.estadoDeAceite(PROJETO)
    expect(e.faltam).toEqual(['DESIGNER', 'CLIENTE'])
    expect(e.contratoId).toBeNull()
  })

  it('com um aceite, falta o outro — e a tela diz qual', async () => {
    db.projeto.findUnique.mockResolvedValue({ designerId: DESIGNER, clienteId: CLIENTE })
    db.contratoProjeto.findFirst.mockResolvedValue({
      id: 'ccontrato1',
      versao: 1,
      aceites: [{ usuarioId: DESIGNER }],
    })

    const e = await service.estadoDeAceite(PROJETO)
    expect(e.faltam).toEqual(['CLIENTE'])
  })

  it('com os dois, não falta ninguém', async () => {
    db.projeto.findUnique.mockResolvedValue({ designerId: DESIGNER, clienteId: CLIENTE })
    db.contratoProjeto.findFirst.mockResolvedValue({
      id: 'ccontrato1',
      versao: 2,
      aceites: [{ usuarioId: DESIGNER }, { usuarioId: CLIENTE }],
    })

    const e = await service.estadoDeAceite(PROJETO)
    expect(e.faltam).toEqual([])
    expect(e.versao).toBe(2)
  })
})

describe('o hash', () => {
  it('muda quando uma vírgula muda', () => {
    expect(hashDoTexto('contrato')).not.toBe(hashDoTexto('contrato.'))
  })

  it('é estável para o mesmo texto', () => {
    expect(hashDoTexto('contrato')).toBe(hashDoTexto('contrato'))
  })

  it('tem 64 hexadecimais, como todo sha256', () => {
    expect(hashDoTexto('x')).toMatch(/^[0-9a-f]{64}$/)
  })
})

/**
 * Mudar os termos depois do aceite.
 *
 * Nada impede o designer de fazer isso, e nada dizia que tinha acontecido: a
 * tela seguia afirmando "Combinado e aceito pelas duas partes. Pode cobrar."
 * sobre um documento que descreve outro acordo. Neste produto esse documento é
 * o que decide de quem é a peça se a conta não for paga.
 */
describe('contrato desatualizado', () => {
  const GERADO_EM = new Date('2026-09-01T12:00:00.000Z')

  /** O snapshot que o contrato guardaria com estes termos. */
  function snapshot(extra: Record<string, unknown> = {}, geradoEm = GERADO_EM) {
    return montarDados({ ...PROJETO_COMPLETO, ...extra } as any, geradoEm)
  }

  it('com os termos intocados, o vigente continua valendo', async () => {
    db.projeto.findUnique.mockResolvedValue(PROJETO_COMPLETO)
    expect(await service.desatualizado(PROJETO, { dados: snapshot() })).toBe(false)
  })

  it('mudar um termo depois de gerado marca o vigente como velho', async () => {
    const aceito = snapshot()
    db.projeto.findUnique.mockResolvedValue({
      ...PROJETO_COMPLETO,
      termos: { ...TERMOS, licencaTerritorio: 'Mundial' },
    })
    expect(await service.desatualizado(PROJETO, { dados: aceito })).toBe(true)
  })

  it('mudar o orçamento também conta — ele está no anexo', async () => {
    const aceito = snapshot()
    db.projeto.findUnique.mockResolvedValue({ ...PROJETO_COMPLETO, orcamento: 2_000_000 })
    expect(await service.desatualizado(PROJETO, { dados: aceito })).toBe(true)
  })

  it('apagar um termo NÃO marca como velho', async () => {
    /*
     * Com termo faltando o anexo nem seria gerado — `gerar` recusa com
     * TERMOS_INCOMPLETOS. Marcar velho aqui mandaria a pessoa regerar para
     * receber um erro, e a saída dela é preencher de volta, não gerar.
     */
    db.projeto.findUnique.mockResolvedValue({
      ...PROJETO_COMPLETO,
      termos: { ...TERMOS, licencaTerritorio: null },
    })
    expect(await service.desatualizado(PROJETO, { dados: snapshot() })).toBe(false)
  })

  it('a data de geração não conta como mudança', async () => {
    /*
     * A primeira versão disto comparava o TEXTO, que carrega "Gerado em: …" —
     * e amarrava a conferência a uma data. Um contrato gerado um segundo antes
     * da meia-noite em UTC apareceria desatualizado no segundo seguinte, sem
     * nada ter sido combinado de novo.
     */
    db.projeto.findUnique.mockResolvedValue(PROJETO_COMPLETO)
    const outroDia = new Date('2020-01-01T23:59:59.000Z')
    expect(await service.desatualizado(PROJETO, { dados: snapshot({}, outroDia) })).toBe(false)
  })

  it('mudar a REDAÇÃO do template não desatualiza contrato nenhum', async () => {
    /*
     * O caso que a comparação por texto quebrava em massa. A redação vai mudar
     * — é o que `TEMPLATE_VERSAO` e `revisadoJuridicamente` existem para
     * acompanhar. Comparando o texto renderizado, no dia da revisão jurídica
     * TODO contrato do produto passaria a se declarar desatualizado, e o aviso
     * mais sério da tela viraria ruído em massa.
     *
     * Aqui o teste não mexe no template: prova a propriedade que torna isso
     * impossível — dois snapshots iguais são o mesmo acordo, e o texto não
     * entra na conta.
     */
    db.projeto.findUnique.mockResolvedValue(PROJETO_COMPLETO)
    const aceito = snapshot()
    expect(await service.desatualizado(PROJETO, { dados: aceito })).toBe(false)
    // E a comparação de fato ignora tudo que não seja o acordo:
    expect(mesmoAcordo(aceito, { ...aceito, geradoEm: 'qualquer coisa' })).toBe(true)
  })

  it('a ordem das chaves não conta — o JSONB devolve reordenado', async () => {
    // O Postgres reordena as chaves do JSONB por tamanho e byte. Um
    // `JSON.stringify` cru acharia diferença entre o que voltou do banco e o
    // que acabou de ser montado.
    const a = snapshot() as any
    const reordenado = Object.fromEntries(Object.keys(a).reverse().map((k) => [k, a[k]]))
    expect(mesmoAcordo(a, reordenado)).toBe(true)
  })
})
