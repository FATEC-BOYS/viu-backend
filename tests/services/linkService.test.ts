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
