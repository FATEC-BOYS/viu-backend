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
const PROJETO_ID = 'cprojeto000000001'

// Projeto em RASCUNHO (pré-requisito para criar convite no ConviteService)
const PROJETO_RASCUNHO = {
  id: PROJETO_ID,
  nome: 'Projeto Teste',
  status: 'RASCUNHO',
  designerId: DESIGNER.id,
  clienteId: CLIENTE.id,
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /projetos/:projetoId/convites — convidar cliente', () => {
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
  })

  it('designer do projeto cria convite → 201', async () => {
    // requireProjectAccess resolves via projeto.designerId
    db.projeto.findUnique.mockResolvedValue(PROJETO_RASCUNHO)
    db.usuario.findUnique
      .mockResolvedValueOnce({ id: CLIENTE.id, email: CLIENTE.email, ativo: true }) // convidado
      .mockResolvedValueOnce({ id: DESIGNER.id, nome: DESIGNER.nome })              // convidadoPor
    db.conviteProjeto.updateMany.mockResolvedValue({ count: 0 })
    db.conviteProjeto.create.mockResolvedValue({ id: 'cconvite000000001' })

    const token = await makeToken(DESIGNER)
    const res = await app.inject({
      method: 'POST',
      url: `/projetos/${PROJETO_ID}/convites`,
      headers: { authorization: `Bearer ${token}`, ...ORIGIN },
      payload: { convidadoId: CLIENTE.id },
    })

    expect(res.statusCode).toBe(201)
    expect(db.conviteProjeto.create).toHaveBeenCalledOnce()
  })

  it('usuário não participante do projeto é bloqueado → 403', async () => {
    const OUTSIDER_ID = 'coutsider000000001'
    // requireProjectAccess: projeto pertence a designer diferente
    db.projeto.findUnique.mockResolvedValue({
      ...PROJETO_RASCUNHO,
      designerId: 'coutherdesigner0001', // NOT the outsider
      clienteId: 'cotherclient00001',
    })

    const token = await makeToken({ ...DESIGNER, id: OUTSIDER_ID })
    const res = await app.inject({
      method: 'POST',
      url: `/projetos/${PROJETO_ID}/convites`,
      headers: { authorization: `Bearer ${token}`, ...ORIGIN },
      payload: { convidadoId: CLIENTE.id },
    })

    expect(res.statusCode).toBe(403)
    expect(db.conviteProjeto.create).not.toHaveBeenCalled()
  })
})
