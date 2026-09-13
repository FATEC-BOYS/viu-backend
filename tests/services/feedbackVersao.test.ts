import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  const mock = criarPrismaMock()
  return { default: mock, prisma: mock }
})
vi.mock('../../src/services/notificacaoService.js', () => ({
  notificacaoService: { dispatch: vi.fn() },
}))

import { prisma } from '../../src/database/client.js'
import { FeedbackService } from '../../src/services/feedbackService.js'

const service = new FeedbackService()
const db = prisma as any

const DESIGNER = 'cd0000000000000000000001'
const CLIENTE = 'cc0000000000000000000001'
const ARTE = 'ca0000000000000000000001'

function arteNaVersao(versao: number) {
  db.arte.findUnique.mockResolvedValue({
    id: ARTE,
    nome: 'Homepage',
    autorId: DESIGNER,
    versao,
    projeto: { designerId: DESIGNER, clienteId: CLIENTE },
  })
  db.usuario.findUnique.mockResolvedValue({ id: CLIENTE, nome: 'João' })
  db.feedback.create.mockResolvedValue({ id: 'cfb1' })
}

beforeEach(() => vi.clearAllMocks())

/**
 * Em qual versão o comentário foi feito.
 *
 * A cláusula 3.2 do anexo define rodada como "o conjunto de feedbacks do
 * Cliente sobre uma mesma versão, consolidado até a próxima versão enviada".
 * Sem este campo isso só se obtinha deduzindo por `criadoEm`, e a dedução erra
 * justamente no caso que vira discussão: o comentário escrito enquanto o
 * designer sobe a versão nova.
 */
describe('o carimbo da versão', () => {
  it('grava a versão que a arte tem no momento do comentário', async () => {
    arteNaVersao(3)
    await service.createFeedback({ arteId: ARTE, autorId: CLIENTE, conteudo: 'Ajustar o topo' })

    expect(db.feedback.create.mock.calls[0][0].data.versaoNumero).toBe(3)
  })

  /*
   * Este é o teste que importa. O número alimenta a contagem de rodadas, que é
   * argumento em disputa — e um valor que a outra parte escolhe não serve de
   * prova contra ela.
   */
  it('ignora a versão enviada no corpo da requisição', async () => {
    arteNaVersao(3)
    await service.createFeedback({
      arteId: ARTE,
      autorId: CLIENTE,
      conteudo: 'Ajustar o topo',
      versaoNumero: 99,
    })

    expect(db.feedback.create.mock.calls[0][0].data.versaoNumero).toBe(3)
  })

  it('resposta em thread também carimba', async () => {
    // Resposta é feedback como qualquer outro; se ficasse sem versão, a
    // contagem da rodada perderia parte do que foi dito nela.
    arteNaVersao(2)
    db.feedback.findUnique.mockResolvedValue({ arteId: ARTE })
    await service.createFeedback({
      arteId: ARTE,
      autorId: CLIENTE,
      conteudo: 'Concordo',
      parentId: 'cfbpai',
    })

    expect(db.feedback.create.mock.calls[0][0].data.versaoNumero).toBe(2)
  })

  it('a primeira versão é 1, não nulo', async () => {
    // `createArte` não gera linha em `ArteVersao`, então a v1 não tem registro
    // de versão — mas tem número, e é ele que o campo guarda.
    arteNaVersao(1)
    await service.createFeedback({ arteId: ARTE, autorId: CLIENTE, conteudo: 'Primeiro' })

    expect(db.feedback.create.mock.calls[0][0].data.versaoNumero).toBe(1)
  })

  it('não sobrescreve o resto do que foi enviado', async () => {
    arteNaVersao(4)
    await service.createFeedback({
      arteId: ARTE,
      autorId: CLIENTE,
      conteudo: 'Texto',
      tipo: 'POSICIONAL',
      posicaoX: 0.5,
      posicaoY: 0.25,
    })

    const data = db.feedback.create.mock.calls[0][0].data
    expect(data.conteudo).toBe('Texto')
    expect(data.tipo).toBe('POSICIONAL')
    expect(data.posicaoX).toBe(0.5)
    expect(data.versaoNumero).toBe(4)
  })
})
