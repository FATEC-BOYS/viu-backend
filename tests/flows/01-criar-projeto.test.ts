import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'

// ── Mocks (hoisted before any import) ───────────────────────────────────────

vi.mock('../../src/database/client.js', () => {
  const db: any = {
    sessao: { findFirst: vi.fn(), create: vi.fn() },
    usuario: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    projeto: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), update: vi.fn(), delete: vi.fn(), aggregate: vi.fn() },
    arte: { count: vi.fn() },
    assinatura: { findFirst: vi.fn() },
    plano: { findMany: vi.fn() },
    auditLog: { create: vi.fn() },
    notificacao: { create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    $transaction: vi.fn(async (ops: any) =>
      Array.isArray(ops) ? Promise.all(ops) : ops(db)
    ),
  }
  return { default: db }
})

vi.mock('../../src/services/notificacaoService.js', () => ({
  notificacaoService: { dispatch: vi.fn() },
}))

vi.mock('../../src/services/storageService.js', () => ({
  storageService: { upload: vi.fn(), delete: vi.fn() },
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────

import prisma from '../../src/database/client.js'
import { buildServer } from '../../src/index.js'
import { makeToken, DESIGNER, CLIENTE, ORIGIN } from '../helpers/token.js'

const db = prisma as any

// ── Fixtures ─────────────────────────────────────────────────────────────────

const SESSION = { id: 'csession000000001' }
const PROJETO = {
  id: 'cprojeto000000001',
  nome: 'Projeto Teste',
  status: 'EM_ANDAMENTO',
  designerId: DESIGNER.id,
  clienteId: CLIENTE.id,
  criadoEm: new Date(),
  atualizadoEm: new Date(),
}

const VALID_BODY = {
  nome: 'Projeto Teste',
  clienteId: CLIENTE.id,
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /projetos — criar projeto', () => {
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
    db.assinatura.findFirst.mockResolvedValue(null) // free tier — no limits
    db.projeto.create.mockResolvedValue(PROJETO)
    db.projeto.findMany.mockResolvedValue([])
    db.usuario.findUnique.mockResolvedValue({ ...CLIENTE, ativo: true })
  })

  it('cria projeto para designer autenticado → 201', async () => {
    const token = await makeToken(DESIGNER)
    const res = await app.inject({
      method: 'POST',
      url: '/projetos',
      headers: { authorization: `Bearer ${token}`, ...ORIGIN },
      payload: VALID_BODY,
    })

    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.success).toBe(true)
    expect(body.data.id).toBe(PROJETO.id)
    expect(db.projeto.create).toHaveBeenCalledOnce()
  })

  it('bloqueia requisição sem token → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/projetos',
      headers: { ...ORIGIN },
      payload: VALID_BODY,
    })

    expect(res.statusCode).toBe(401)
    expect(res.json().success).toBe(false)
  })

  it('bloqueia quando limite de plano é atingido → 402', async () => {
    // Assinatura ativa com plano que limitou projetos a 1
    db.assinatura.findFirst.mockResolvedValue({
      id: 'cassign00000001',
      status: 'ATIVA',
      plano: { nome: 'Starter', limitesProjetos: 1, limitesArtes: null },
    })
    // Simulação: usuário já tem 1 projeto (atingiu o limite)
    db.projeto.count = vi.fn().mockResolvedValue(1)

    const token = await makeToken(DESIGNER)
    const res = await app.inject({
      method: 'POST',
      url: '/projetos',
      headers: { authorization: `Bearer ${token}`, ...ORIGIN },
      payload: VALID_BODY,
    })

    expect(res.statusCode).toBe(402)
    const body = res.json()
    expect(body.limitReached).toBe(true)
    expect(body.resource).toBe('projetos')
  })
})
