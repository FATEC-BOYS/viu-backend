import { describe, it, expect, vi, beforeEach } from 'vitest'

// linkService importa o named export, não o default — o mock precisa dos dois
// apontando para o MESMO objeto, senão o teste espia um proxy e o service usa
// outro.
vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  const mock = criarPrismaMock()
  return { default: mock, prisma: mock }
})

// `signPath` fala com o R2. Aqui só interessa o nome do campo em que a URL
// assinada sai, então devolver uma string fixa basta.
vi.mock('../../src/utils/storage.js', () => ({
  signPath: vi.fn(async (caminho: string | null) =>
    caminho ? `https://r2.exemplo/${caminho}?assinado` : null,
  ),
}))

import { prisma } from '../../src/database/client.js'
import { LinkService } from '../../src/services/linkService.js'

const service = new LinkService()
const db = prisma as any

beforeEach(() => {
  vi.clearAllMocks()
  db.linkCompartilhado.findMany.mockResolvedValue([])
})

/** O que a listagem de links entrega sobre o cliente do projeto. */
describe('listLinks', () => {
  async function selectDoCliente(isAdmin = false) {
    await service.listLinks('cdesigner00000000000000001', isAdmin)
    const [args] = db.linkCompartilhado.findMany.mock.calls[0]
    return args.include.arte.select.projeto.select.cliente.select
  }

  /**
   * O designer precisa do telefone para mandar o link de revisão pelo
   * WhatsApp. Sem isto ele redigita o número a cada envio, mesmo com o
   * cadastro preenchido pelo próprio ClienteWizard.
   */
  it('devolve o telefone do cliente junto com o nome', async () => {
    const select = await selectDoCliente()
    expect(select).toMatchObject({ nome: true, telefone: true })
  })

  /**
   * Listagem não é lugar de despejar o cadastro inteiro: o designer precisa de
   * nome e telefone para falar com a pessoa, e de mais nada.
   */
  it('não vaza o resto do cadastro do cliente', async () => {
    const select = await selectDoCliente()
    for (const campo of ['senha', 'email', 'twoFactorSecret', 'emailVerificacaoToken']) {
      expect(select[campo]).toBeUndefined()
    }
  })

  it('não-admin só enxerga links de projeto em que participa', async () => {
    await service.listLinks('cdesigner00000000000000001', false)
    const [args] = db.linkCompartilhado.findMany.mock.calls[0]
    expect(args.where.arte.projeto.OR).toEqual([
      { designerId: 'cdesigner00000000000000001' },
      { clienteId: 'cdesigner00000000000000001' },
    ])
  })

  it('admin não recebe filtro de escopo', async () => {
    await service.listLinks('cadmin000000000000000001', true)
    const [args] = db.linkCompartilhado.findMany.mock.calls[0]
    expect(args.where).toEqual({})
  })
})

/**
 * O contrato do link público com o viewer.
 *
 * O frontend lê `previewUrl` — é o nome que arteController e aprovacaoController
 * emitem. Esta rota mandava só `arquivo_url`, e o viewer caía no
 * `?? arte.arquivo`, que é a chave crua do bucket: a arte carregava em toda
 * tela logada e quebrava exatamente no link compartilhado, que é o único lugar
 * por onde o cliente entra.
 */
describe('getPreviewByToken', () => {
  const AGORA = new Date('2026-09-12T12:00:00.000Z')

  function prepararLinkValido() {
    db.linkCompartilhado.findUnique.mockResolvedValue({
      id: 'clink0000000000000000001',
      token: 'tok',
      tipo: 'ARTE',
      arteId: 'carte0000000000000000001',
      somenteLeitura: false,
      expiraEm: null,
      revogado: false,
      limiteTentativas: null,
      acessos: 4,
      criadoEm: AGORA,
    })
    db.linkCompartilhado.update.mockResolvedValue({})
    db.arte.findUnique.mockResolvedValue({
      id: 'carte0000000000000000001',
      nome: 'teste',
      arquivo: 'artes/carte0000000000000000001/teste.png',
      versao: 1,
      projeto: { nome: 'Site' },
      autor: { nome: 'Ana' },
    })
    db.feedback.findMany.mockResolvedValue([])
  }

  it('entrega a URL assinada em previewUrl, que é o campo que o viewer lê', async () => {
    prepararLinkValido()
    const preview = await service.getPreviewByToken('tok')
    expect(preview.arte.previewUrl).toBe(
      'https://r2.exemplo/artes/carte0000000000000000001/teste.png?assinado',
    )
  })

  it('mantém arquivo_url, que a tela de feedbacks ainda consome', async () => {
    prepararLinkValido()
    const preview = await service.getPreviewByToken('tok')
    expect((preview.arte as any).arquivo_url).toBe(preview.arte.previewUrl)
  })

  /**
   * A chave crua continua vindo no payload (é coluna da Arte), mas nunca pode
   * ser o que o viewer usa: `<img src="artes/…">` resolve contra a origem do
   * front e dá 404 — foi esse o bug.
   */
  it('não confunde a chave do bucket com a URL de exibição', async () => {
    prepararLinkValido()
    const preview = await service.getPreviewByToken('tok')
    expect(preview.arte.arquivo).toBe('artes/carte0000000000000000001/teste.png')
    expect(preview.arte.previewUrl).not.toBe(preview.arte.arquivo)
  })

  /*
   * O mesmo bug da imagem, no áudio do comentário — e com uma causa a mais.
   *
   * A assinatura do áudio era condicionada a `fb.tipo === 'AUDIO'`, e
   * `createFeedbackComAudio` rotulava como `POSICIONAL` toda gravação feita
   * sobre um ponto da arte. Resultado medido no link público: o áudio com
   * pino saía com `arquivo_url: null`, o viewer não desenhava player nenhum,
   * e a gravação ficava no bucket sem nenhum caminho até ela.
   *
   * Um feedback tem áudio quando tem ARQUIVO. O rótulo não decide isso.
   */
  it('assina o áudio do comentário mesmo quando o rótulo é POSICIONAL', async () => {
    prepararLinkValido()
    db.feedback.findMany.mockResolvedValue([
      {
        id: 'cfb00000000000000000001',
        conteudo: 'Esse canto ficou apertado',
        tipo: 'POSICIONAL',
        arquivo: 'feedbacks/carte0000000000000000001/123_gravacao.webm',
        posicaoX: 30,
        posicaoY: 40,
        autor: { nome: 'João' },
      },
    ])

    const preview = await service.getPreviewByToken('tok')
    expect((preview.feedbacks[0] as any).arquivo_url).toBe(
      'https://r2.exemplo/feedbacks/carte0000000000000000001/123_gravacao.webm?assinado',
    )
  })

  it('comentário de texto não ganha endereço de áudio', async () => {
    prepararLinkValido()
    db.feedback.findMany.mockResolvedValue([
      {
        id: 'cfb00000000000000000002',
        conteudo: 'O azul ficou pesado',
        tipo: 'TEXTO',
        arquivo: null,
        autor: { nome: 'João' },
      },
    ])

    const preview = await service.getPreviewByToken('tok')
    expect((preview.feedbacks[0] as any).arquivo_url).toBeNull()
  })

  it('conta o acesso que está sendo servido, sem esperar o incremento no banco', async () => {
    prepararLinkValido()
    const preview = await service.getPreviewByToken('tok')
    expect(preview.acessos).toBe(5)
  })

  it('recusa link revogado antes de tocar na arte', async () => {
    prepararLinkValido()
    db.linkCompartilhado.findUnique.mockResolvedValue({
      id: 'clink0000000000000000001', token: 'tok', tipo: 'ARTE',
      arteId: 'carte0000000000000000001', somenteLeitura: false, expiraEm: null,
      revogado: true, limiteTentativas: null, acessos: 0, criadoEm: AGORA,
    })
    await expect(service.getPreviewByToken('tok')).rejects.toThrow('Link revogado')
    expect(db.arte.findUnique).not.toHaveBeenCalled()
  })
})


describe('histórico pelo link', () => {
  it('assina apenas versões da arte e não conta nova visita', async () => {
    db.linkCompartilhado.findUnique.mockResolvedValue({ tipo: 'ARTE', arteId: 'arte1', revogado: false, expiraEm: null, limiteTentativas: null, acessos: 1 })
    db.arteVersao.findMany.mockResolvedValue([{ id: 'v1', numero: 1, arquivo: 'privado/v1.png', descricao: 'Primeira entrega' }])
    const res = await service.listarVersoesPorToken('tok')
    expect(db.arteVersao.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { arteId: 'arte1' } }))
    expect(res[0]).toMatchObject({ numero: 1, descricao: 'Primeira entrega', arquivoUrl: 'https://r2.exemplo/privado/v1.png?assinado' })
    expect(res[0]).not.toHaveProperty('arquivo')
    expect(db.linkCompartilhado.update).not.toHaveBeenCalled()
  })
  it.each([{ revogado: true }, { expiraEm: new Date('2020-01-01') }, { limiteTentativas: 1, acessos: 1 }])('não expõe arquivos de link indisponível: %j', async over => {
    db.linkCompartilhado.findUnique.mockResolvedValue({ tipo: 'ARTE', arteId: 'arte1', revogado: false, expiraEm: null, limiteTentativas: null, acessos: 0, ...over })
    await expect(service.listarVersoesPorToken('tok')).rejects.toThrow()
    expect(db.arteVersao.findMany).not.toHaveBeenCalled()
  })
})
