/**
 * Artes e feedbacks pela borda HTTP.
 *
 * Foco em leitura: a suíte de IDOR cobre escrita cross-tenant, e os fluxos
 * cobrem criação. O que faltava era garantir que *ler* também respeita o
 * isolamento — listagem escopada e leitura por id negada para terceiros.
 */
import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  return { default: criarPrismaMock() }
})

vi.mock('../../src/services/notificacaoService.js', async () => {
  const { criarNotificacaoMock } = await import('../helpers/notificacaoMock.js')
  return criarNotificacaoMock()
})

vi.mock('../../src/utils/storage.js', () => ({
  uploadFile: vi.fn(),
  deleteFile: vi.fn(),
  signPath: vi.fn(async (k: string) => `https://r2.example.com/${k}?assinado`),
}))

import prisma from '../../src/database/client.js'
import { buildServer } from '../../src/index.js'
import { makeToken, DESIGNER, DESIGNER_B, CLIENTE, CLIENTE_B, ORIGIN } from '../helpers/token.js'

const db = prisma as any

const SESSAO = { id: 'csessao000000000000000001' }
const PROJETO_A = { id: 'cprojetoa0000000000000001', designerId: DESIGNER.id, clienteId: CLIENTE.id }
const PROJETO_B = { id: 'cprojetob0000000000000001', designerId: DESIGNER_B.id, clienteId: CLIENTE_B.id }

const ARTE_A = {
  id: 'cartea0000000000000000001',
  nome: 'Arte própria',
  arquivo: 'artes/a/v1/a.png',
  projetoId: PROJETO_A.id,
  autorId: DESIGNER.id,
  projeto: { designerId: PROJETO_A.designerId, clienteId: PROJETO_A.clienteId },
  feedbacks: [],
  aprovacoes: [],
}

const ARTE_B = {
  id: 'carteb0000000000000000001',
  nome: 'Arte alheia',
  arquivo: 'artes/b/v1/b.png',
  projetoId: PROJETO_B.id,
  autorId: DESIGNER_B.id,
  projeto: { designerId: PROJETO_B.designerId, clienteId: PROJETO_B.clienteId },
  feedbacks: [],
  aprovacoes: [],
}

let app: FastifyInstance
let tokenA: string

const auth = () => ({ authorization: `Bearer ${tokenA}`, ...ORIGIN })

beforeAll(async () => {
  app = await buildServer()
  await app.ready()
  tokenA = await makeToken(DESIGNER)
})

afterAll(async () => {
  await app.close()
})

beforeEach(() => {
  vi.clearAllMocks()
  db.sessao.findFirst.mockResolvedValue(SESSAO)
  // Designer A só alcança o próprio projeto.
  db.projeto.findMany.mockResolvedValue([{ id: PROJETO_A.id }])
})

describe('GET /artes', () => {
  it('sem token → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/artes', headers: { ...ORIGIN } })
    expect(res.statusCode).toBe(401)
  })

  it('escopa a listagem aos projetos do usuário', async () => {
    db.arte.findMany.mockResolvedValue([ARTE_A])
    db.arte.count.mockResolvedValue(1)

    const res = await app.inject({ method: 'GET', url: '/artes', headers: auth() })

    expect(res.statusCode).toBe(200)
    expect(db.arte.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ projetoId: { in: [PROJETO_A.id] } }),
      }),
    )
  })

  /**
   * A grade de artes mostrava o ícone de imagem quebrada: a listagem
   * devolvia só `arquivo`, a chave do bucket, e chave crua no `src` de um
   * `<img>` não carrega nada. Só a resposta do upload assinava — então a
   * miniatura existia no instante em que a arte subia e nunca mais.
   */
  it('devolve previewUrl assinada em cada item, não a chave do bucket', async () => {
    db.arte.findMany.mockResolvedValue([ARTE_A])
    db.arte.count.mockResolvedValue(1)

    const res = await app.inject({ method: 'GET', url: '/artes', headers: auth() })

    expect(res.statusCode).toBe(200)
    const item = res.json().data[0]
    expect(item.previewUrl).toContain('assinado')
    expect(item.previewUrl).toMatch(/^https?:\/\//)
  })

  it('filtrar por projeto alheio → 403, não lista vazia', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/artes?projetoId=${PROJETO_B.id}`,
      headers: auth(),
    })

    expect(res.statusCode).toBe(403)
    expect(db.arte.findMany).not.toHaveBeenCalled()
  })

  it('filtro por projeto próprio soma ao escopo em vez de substituí-lo', async () => {
    db.arte.findMany.mockResolvedValue([ARTE_A])
    db.arte.count.mockResolvedValue(1)

    const res = await app.inject({
      method: 'GET',
      url: `/artes?projetoId=${PROJETO_A.id}`,
      headers: auth(),
    })

    expect(res.statusCode).toBe(200)
    // As duas condições precisam sobreviver: o escopo de acesso não pode ser
    // apagado por um filtro que quem chama escolheu.
    expect(db.arte.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: [{ projetoId: PROJETO_A.id }, { projetoId: { in: [PROJETO_A.id] } }],
        }),
      }),
    )
  })
})

describe('GET /artes/:id', () => {
  it('devolve a arte do próprio projeto com URL assinada', async () => {
    db.arte.findUnique.mockResolvedValue(ARTE_A)
    db.fatura.count.mockResolvedValue(0)

    const res = await app.inject({ method: 'GET', url: `/artes/${ARTE_A.id}`, headers: auth() })

    expect(res.statusCode).toBe(200)
    expect(res.json().data.arquivo_url).toContain('assinado')
    // O frontend lê `previewUrl`; `arquivo_url` era um terceiro nome para o
    // mesmo dado, e por isso a tela de detalhe também não mostrava nada.
    expect(res.json().data.previewUrl).toContain('assinado')
  })

  it('arte de outro tenant → 403', async () => {
    db.arte.findUnique.mockResolvedValue(ARTE_B)

    const res = await app.inject({ method: 'GET', url: `/artes/${ARTE_B.id}`, headers: auth() })

    expect(res.statusCode).toBe(403)
  })

  it('id que não corresponde a recurso nenhum → 404', async () => {
    db.arte.findUnique.mockResolvedValue(null)
    db.tarefa.findUnique.mockResolvedValue(null)
    db.feedback.findUnique.mockResolvedValue(null)

    const res = await app.inject({
      method: 'GET',
      url: '/artes/cfantasma0000000000000001',
      headers: auth(),
    })

    expect(res.statusCode).toBe(404)
  })
})

describe('GET /feedbacks', () => {
  it('escopa a listagem aos projetos do usuário', async () => {
    db.feedback.findMany.mockResolvedValue([])
    db.feedback.count.mockResolvedValue(0)

    const res = await app.inject({ method: 'GET', url: '/feedbacks', headers: auth() })

    expect(res.statusCode).toBe(200)
    const where = db.feedback.findMany.mock.calls[0][0].where
    expect(where.AND).toContainEqual({ arte: { projetoId: { in: [PROJETO_A.id] } } })
  })

  it('sem token → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/feedbacks', headers: { ...ORIGIN } })
    expect(res.statusCode).toBe(401)
  })
})

describe('GET /feedbacks/:id', () => {
  const FEEDBACK_B = {
    id: 'cfeedbackb000000000000001',
    arteId: ARTE_B.id,
    conteudo: 'comentário alheio',
    tipo: 'TEXTO',
    arte: { projetoId: PROJETO_B.id, projeto: ARTE_B.projeto },
  }

  it('feedback de outro tenant → 403', async () => {
    db.arte.findUnique.mockResolvedValue(null)
    db.tarefa.findUnique.mockResolvedValue(null)
    db.feedback.findUnique.mockResolvedValue(FEEDBACK_B)

    const res = await app.inject({
      method: 'GET',
      url: `/feedbacks/${FEEDBACK_B.id}`,
      headers: auth(),
    })

    expect(res.statusCode).toBe(403)
  })
})

describe('PUT /feedbacks/:id', () => {
  it('participante do projeto que não é o autor → 403', async () => {
    const FEEDBACK_DO_CLIENTE = {
      id: 'cfeedbacka000000000000001',
      arteId: ARTE_A.id,
      autorId: CLIENTE.id,
      arte: { projetoId: PROJETO_A.id, projeto: ARTE_A.projeto },
    }
    db.arte.findUnique.mockResolvedValue(null)
    db.tarefa.findUnique.mockResolvedValue(null)
    db.feedback.findUnique.mockResolvedValue(FEEDBACK_DO_CLIENTE)

    const res = await app.inject({
      method: 'PUT',
      url: `/feedbacks/${FEEDBACK_DO_CLIENTE.id}`,
      headers: auth(),
      payload: { conteudo: 'editado por quem não escreveu' },
    })

    // requireProjectAccess deixa passar (é o projeto dele), requireAuthor barra.
    expect(res.statusCode).toBe(403)
    expect(db.feedback.update).not.toHaveBeenCalled()
  })
})
