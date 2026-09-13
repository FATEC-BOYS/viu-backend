import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  const mock = criarPrismaMock()
  return { default: mock, prisma: mock }
})

vi.mock('../../src/services/notificacaoService.js', async () => {
  const { criarNotificacaoMock } = await import('../helpers/notificacaoMock.js')
  return criarNotificacaoMock()
})

// A assinatura de URL vai para o R2 — irrelevante aqui e indisponível em teste.
vi.mock('../../src/utils/storage.js', () => ({
  signPath: vi.fn(async (p: string) => `https://r2.test/${p}?assinado`),
}))

// ── Imports ───────────────────────────────────────────────────────────────────

import prisma from '../../src/database/client.js'
import { buildServer } from '../../src/index.js'
import { makeToken, DESIGNER, CLIENTE, ORIGIN } from '../helpers/token.js'

const db = prisma as any

const SESSION = { id: 'csession000000001' }
const ARTE_ID = 'carte00000000000000000001'
const PROJETO_ID = 'cprojeto00000000000000001'

const ARTE = {
  id: ARTE_ID,
  nome: 'Homepage',
  status: 'EM_ANALISE',
  arquivo: 'uploads/homepage.png',
  versao: 1,
  autorId: DESIGNER.id,
  projetoId: PROJETO_ID,
  projeto: { id: PROJETO_ID, nome: 'Site', clienteId: CLIENTE.id, designerId: DESIGNER.id },
  feedbacks: [],
  aprovacoes: [],
  tarefas: [],
}

/**
 * Fatura pendente não esconde mais a arte do cliente.
 *
 * `getArteById` devolvia 402 para CLIENTE com fatura PENDENTE, e o comentário
 * dizia "block download". Três coisas estavam erradas:
 *
 *  - barrava o detalhe inteiro, não o download: preview e feedbacks iam junto,
 *    então o cliente não conseguia nem ver o trabalho para decidir pagar;
 *  - `getPreviewByToken` nunca teve a checagem, então o mesmo cliente via tudo
 *    pelo link que o designer mandou — o bloqueio não retinha coisa alguma;
 *  - era punição sem aviso: clicava e levava erro, sem nada antes dizendo que
 *    faltava pagar.
 *
 * No lugar entrou informação: `licenca` diz na própria peça se o uso está
 * licenciado (cláusula 7.1 do anexo). Este arquivo trava a remoção — sem ele,
 * o bloqueio é só uma ausência, e ausência volta.
 */
describe('GET /artes/:id com fatura pendente', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildServer()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    db.sessao.findFirst.mockResolvedValue(SESSION)
    db.equipeMembro.findFirst.mockResolvedValue(null)
    db.arte.findUnique.mockResolvedValue(ARTE)
    // requireProjectAccess: o cliente é parte do projeto.
    db.projeto.findUnique.mockResolvedValue(ARTE.projeto)
    db.projeto.findFirst.mockResolvedValue(ARTE.projeto)
  })

  it('o cliente vê a arte, com a fatura em aberto', async () => {
    db.fatura.findMany.mockResolvedValue([{ status: 'PENDENTE', dataPagamento: null }])

    const token = await makeToken(CLIENTE)
    const res = await app.inject({
      method: 'GET',
      url: `/artes/${ARTE_ID}`,
      headers: { authorization: `Bearer ${token}`, ...ORIGIN },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().data.id).toBe(ARTE_ID)
  })

  it('e os feedbacks vêm junto — eram barrados pelo mesmo 402', async () => {
    db.fatura.findMany.mockResolvedValue([{ status: 'PENDENTE', dataPagamento: null }])
    db.arte.findUnique.mockResolvedValue({
      ...ARTE,
      feedbacks: [{ id: 'cfb1', conteudo: 'Ajustar o topo', tipo: 'TEXTO', arquivo: null }],
    })

    const token = await makeToken(CLIENTE)
    const res = await app.inject({
      method: 'GET',
      url: `/artes/${ARTE_ID}`,
      headers: { authorization: `Bearer ${token}`, ...ORIGIN },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().data.feedbacks).toHaveLength(1)
  })

  it('o estado da licença vem na resposta, que é o que substituiu o bloqueio', async () => {
    db.fatura.findMany.mockResolvedValue([{ status: 'PENDENTE', dataPagamento: null }])

    const token = await makeToken(CLIENTE)
    const res = await app.inject({
      method: 'GET',
      url: `/artes/${ARTE_ID}`,
      headers: { authorization: `Bearer ${token}`, ...ORIGIN },
    })

    // Informar em vez de punir: a peça carrega o próprio estado de licença.
    expect(res.json().data.licenca).toEqual({ estado: 'EM_ABERTO', quitadoEm: null })
  })

  it('com a fatura paga, a licença aparece vigente', async () => {
    db.fatura.findMany.mockResolvedValue([
      { status: 'PAGA', dataPagamento: new Date('2026-09-13T10:00:00.000Z') },
    ])

    const token = await makeToken(CLIENTE)
    const res = await app.inject({
      method: 'GET',
      url: `/artes/${ARTE_ID}`,
      headers: { authorization: `Bearer ${token}`, ...ORIGIN },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().data.licenca.estado).toBe('QUITADO')
  })

  it('o designer também vê — nunca foi barrado, e segue não sendo', async () => {
    db.fatura.findMany.mockResolvedValue([{ status: 'PENDENTE', dataPagamento: null }])

    const token = await makeToken(DESIGNER)
    const res = await app.inject({
      method: 'GET',
      url: `/artes/${ARTE_ID}`,
      headers: { authorization: `Bearer ${token}`, ...ORIGIN },
    })

    expect(res.statusCode).toBe(200)
  })

  it('nenhum caminho devolve 402 por falta de pagamento', async () => {
    // O 402 continua existindo no produto para limite de plano
    // (`planLimitMiddleware`), que é outra coisa. Aqui ele não deve aparecer
    // em nenhuma combinação de fatura.
    const cenarios = [
      [{ status: 'PENDENTE', dataPagamento: null }],
      [{ status: 'ESTORNADA', dataPagamento: new Date() }],
      [],
    ]

    for (const faturas of cenarios) {
      db.fatura.findMany.mockResolvedValue(faturas)
      const token = await makeToken(CLIENTE)
      const res = await app.inject({
        method: 'GET',
        url: `/artes/${ARTE_ID}`,
        headers: { authorization: `Bearer ${token}`, ...ORIGIN },
      })
      expect(res.statusCode).not.toBe(402)
    }
  })
})
