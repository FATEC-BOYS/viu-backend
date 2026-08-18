import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  return { default: criarPrismaMock() }
})

vi.mock('../../src/services/notificacaoService.js', async () => {
  const { criarNotificacaoMock } = await import('../helpers/notificacaoMock.js')
  return criarNotificacaoMock()
})

// ── Imports ───────────────────────────────────────────────────────────────────

import prisma from '../../src/database/client.js'
import { buildServer } from '../../src/index.js'
import { makeToken, DESIGNER, CLIENTE, ORIGIN } from '../helpers/token.js'

const db = prisma as any

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SESSION = { id: 'csession000000001' }
const ARTE_ID = 'carte00000000001'
const APROVACAO_ID = 'caprovacao000000000000001'
const PROJETO_ID = 'cprojeto000000001'

const ARTE = {
  id: ARTE_ID,
  nome: 'Arte Teste',
  status: 'EM_ANALISE',
  autorId: DESIGNER.id,
  projetoId: PROJETO_ID,
  projeto: { clienteId: CLIENTE.id, designerId: DESIGNER.id },
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /aprovacoes — aprovar arte', () => {
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
    // requirePermission(APROVAR_ARTE): CLIENTE tipo global tem a permissão
    db.equipeMembro.findFirst.mockResolvedValue(null)
  })

  it('cliente do projeto aprova arte → 201', async () => {
    db.arte.findUnique.mockResolvedValue(ARTE)
    db.aprovacao.create.mockResolvedValue({
      id: APROVACAO_ID,
      arteId: ARTE_ID,
      aprovadorId: CLIENTE.id,
      status: 'APROVADO',
      comentario: null,
      criadoEm: new Date(),
    })

    const token = await makeToken(CLIENTE)
    const res = await app.inject({
      method: 'POST',
      url: '/aprovacoes',
      headers: { authorization: `Bearer ${token}`, ...ORIGIN },
      payload: { arteId: ARTE_ID, status: 'APROVADO' },
    })

    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.success).toBe(true)
    expect(body.data.status).toBe('APROVADO')
    expect(db.aprovacao.create).toHaveBeenCalledOnce()
  })

  it('designer não pode aprovar a própria arte → 403', async () => {
    // Designer is autorId — service rejects 'O autor não pode aprovar a própria arte'
    db.arte.findUnique.mockResolvedValue({
      ...ARTE,
      projeto: { clienteId: DESIGNER.id, designerId: DESIGNER.id }, // designer is also "client" (edge case test)
      autorId: DESIGNER.id,
    })

    const token = await makeToken(DESIGNER)
    const res = await app.inject({
      method: 'POST',
      url: '/aprovacoes',
      headers: { authorization: `Bearer ${token}`, ...ORIGIN },
      payload: { arteId: ARTE_ID, status: 'APROVADO' },
    })

    expect(res.statusCode).toBe(403)
    expect(db.aprovacao.create).not.toHaveBeenCalled()
  })
})

describe('PUT /aprovacoes/:id — máquina de estados', () => {
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
    db.feedback.findUnique.mockResolvedValue(null)
    db.aprovacao.findUnique.mockResolvedValue({ aprovadorId: CLIENTE.id })
  })

  it('atualizar aprovação em estado terminal é rejeitado → 409', async () => {
    // APROVADO is terminal — APROVACAO_TRANSITIONS['APROVADO'] = []
    db.aprovacao.findUnique.mockResolvedValue({
      id: APROVACAO_ID,
      status: 'APROVADO',
      aprovadorId: CLIENTE.id,
      deletedAt: null,
      arte: {
        id: ARTE_ID,
        projetoId: PROJETO_ID,
        projeto: { clienteId: CLIENTE.id },
      },
    })

    const token = await makeToken(CLIENTE)
    const res = await app.inject({
      method: 'PUT',
      url: `/aprovacoes/${APROVACAO_ID}`,
      headers: { authorization: `Bearer ${token}`, ...ORIGIN },
      payload: { status: 'REJEITADO' },
    })

    // estado terminal: erro do cliente, não do servidor
    expect(res.statusCode).toBe(409)
    expect(db.aprovacao.update).not.toHaveBeenCalled()
  })
})
