/**
 * Saques, chaves PIX e extrato — a parte do sistema que move dinheiro.
 *
 * Nenhum destes caminhos tinha teste pela borda HTTP. Como não há um
 * `requireProjectAccess` para segurar aqui, a autorização inteira mora nos
 * handlers e no service: cada rota abaixo existe para fixar isso.
 */
import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  return { default: criarPrismaMock() }
})

import prisma from '../../src/database/client.js'
import { buildServer } from '../../src/index.js'
import { makeToken, DESIGNER, DESIGNER_B, ADMIN, ORIGIN } from '../helpers/token.js'

const db = prisma as any

const SESSAO = { id: 'csessao000000000000000001' }
const CHAVE_A = { id: 'cchavea00000000000000001', usuarioId: DESIGNER.id, ativa: true, tipo: 'EMAIL' }
const CHAVE_B = { id: 'cchaveb00000000000000001', usuarioId: DESIGNER_B.id, ativa: true, tipo: 'EMAIL' }

let app: FastifyInstance
let tokenA: string
let tokenAdmin: string

const auth = (t = tokenA) => ({ authorization: `Bearer ${t}`, ...ORIGIN })

/** Saldo = faturas pagas − saques já comprometidos. */
function mockarSaldo(recebido: number, sacado: number) {
  db.fatura.aggregate.mockResolvedValue({ _sum: { valorLiquidoDesigner: recebido } })
  db.saque.aggregate.mockResolvedValue({ _sum: { valor: sacado } })
}

beforeAll(async () => {
  app = await buildServer()
  await app.ready()
  tokenA = await makeToken(DESIGNER)
  tokenAdmin = await makeToken(ADMIN)
})

afterAll(async () => {
  await app.close()
})

beforeEach(() => {
  vi.clearAllMocks()
  db.sessao.findFirst.mockResolvedValue(SESSAO)
})

describe('GET /saques/saldo', () => {
  it('sem token → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/saques/saldo', headers: { ...ORIGIN } })
    expect(res.statusCode).toBe(401)
  })

  it('calcula sobre o próprio designer, nunca sobre um id da query', async () => {
    mockarSaldo(100_00, 30_00)

    const res = await app.inject({
      method: 'GET',
      url: `/saques/saldo?designerId=${DESIGNER_B.id}`,
      headers: auth(),
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().data.saldo).toBe(70_00)
    // O designerId da agregação vem da sessão, não da query.
    for (const call of db.fatura.aggregate.mock.calls) {
      expect(call[0].where.designerId).toBe(DESIGNER.id)
    }
  })
})

describe('POST /saques', () => {
  it('recusa saque com chave PIX de outro designer', async () => {
    db.chavePix.findUnique.mockResolvedValue(CHAVE_B)
    mockarSaldo(100_00, 0)

    const res = await app.inject({
      method: 'POST',
      url: '/saques',
      headers: auth(),
      payload: { chavePixId: CHAVE_B.id, valor: 10_00 },
    })

    expect(res.statusCode).toBe(403)
    expect(db.saque.create).not.toHaveBeenCalled()
  })

  it('recusa saque acima do saldo disponível', async () => {
    db.chavePix.findUnique.mockResolvedValue(CHAVE_A)
    mockarSaldo(50_00, 45_00)

    const res = await app.inject({
      method: 'POST',
      url: '/saques',
      headers: auth(),
      payload: { chavePixId: CHAVE_A.id, valor: 10_00 },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().message).toMatch(/Saldo insuficiente/)
    expect(db.saque.create).not.toHaveBeenCalled()
  })

  it('cria saque dentro do saldo → 201', async () => {
    db.chavePix.findUnique.mockResolvedValue(CHAVE_A)
    mockarSaldo(100_00, 0)
    db.saque.create.mockResolvedValue({ id: 'csaque0000000000000000001', valor: 10_00 })

    const res = await app.inject({
      method: 'POST',
      url: '/saques',
      headers: auth(),
      payload: { chavePixId: CHAVE_A.id, valor: 10_00 },
    })

    expect(res.statusCode).toBe(201)
    expect(db.saque.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ designerId: DESIGNER.id, status: 'SOLICITADO' }),
      }),
    )
  })
})

describe('DELETE /chaves-pix/:id', () => {
  it('não remove chave de outro designer', async () => {
    db.chavePix.findUnique.mockResolvedValue(CHAVE_B)

    const res = await app.inject({
      method: 'DELETE',
      url: `/chaves-pix/${CHAVE_B.id}`,
      headers: auth(),
    })

    // Já era barrado, mas respondia 500 — 'Acesso negado' não estava mapeado.
    expect(res.statusCode).toBe(403)
    expect(db.chavePix.update).not.toHaveBeenCalled()
  })

  it('remove a própria chave → 200', async () => {
    db.chavePix.findUnique.mockResolvedValue(CHAVE_A)
    db.chavePix.update.mockResolvedValue({ ...CHAVE_A, ativa: false })

    const res = await app.inject({
      method: 'DELETE',
      url: `/chaves-pix/${CHAVE_A.id}`,
      headers: auth(),
    })

    expect(res.statusCode).toBe(200)
    expect(db.chavePix.update).toHaveBeenCalled()
  })
})

describe('GET /ledger/:designerId', () => {
  it('extrato de outro designer → 403', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/ledger/${DESIGNER_B.id}`,
      headers: auth(),
    })

    expect(res.statusCode).toBe(403)
    expect(db.ledgerEntry.findMany).not.toHaveBeenCalled()
  })

  it('ADMIN consulta extrato de qualquer designer', async () => {
    db.ledgerEntry.findMany.mockResolvedValue([])

    const res = await app.inject({
      method: 'GET',
      url: `/ledger/${DESIGNER_B.id}`,
      headers: auth(tokenAdmin),
    })

    expect(res.statusCode).toBe(200)
    expect(db.ledgerEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { designerId: DESIGNER_B.id } }),
    )
  })
})

describe('rotas administrativas', () => {
  it('GET /admin/saques para não-admin → 403', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin/saques', headers: auth() })

    expect(res.statusCode).toBe(403)
    expect(db.saque.findMany).not.toHaveBeenCalled()
  })

  it('PUT /admin/saques/:id/status para não-admin → 403', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/admin/saques/csaque0000000000000000001/status',
      headers: auth(),
      payload: { status: 'CONCLUIDO' },
    })

    expect(res.statusCode).toBe(403)
    expect(db.saque.update).not.toHaveBeenCalled()
  })
})
