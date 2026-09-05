/**
 * Sessões — gestão de dispositivos conectados.
 *
 * O que estes testes seguram: os handlers descobrem o token da requisição
 * atual pela mesma via que o `authenticate` usa. Enquanto liam
 * `headers.authorization` cru, a sessão por cookie (o padrão do navegador
 * desde a migração para HttpOnly) ficava sem token identificado, e o resultado
 * era `isCurrent` sempre falso, a trava de "não revogue a si mesmo" nunca
 * disparando, e `revoke-others` respondendo 401 para todo mundo — justamente o
 * botão de "me roubaram a sessão".
 */
import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  return { default: criarPrismaMock() }
})

import prisma from '../../src/database/client.js'
import { buildServer } from '../../src/index.js'
import { makeToken, DESIGNER, DESIGNER_B, ORIGIN } from '../helpers/token.js'

const db = prisma as any

const SESSAO_ATUAL = { id: 'csessao000000000000000001' }
const SESSAO_OUTRA = { id: 'csessao000000000000000002' }

let app: FastifyInstance
let token: string

beforeAll(async () => {
  app = await buildServer()
  await app.ready()
  token = await makeToken(DESIGNER)
})

afterAll(async () => {
  await app.close()
})

beforeEach(() => {
  vi.clearAllMocks()
  db.sessao.findFirst.mockResolvedValue(SESSAO_ATUAL)
})

describe('GET /sessoes', () => {
  it('marca a sessão do cookie como atual', async () => {
    db.sessao.findMany.mockResolvedValue([
      { ...SESSAO_ATUAL, ativo: true, token, criadoEm: new Date(), expiresAt: new Date() },
      { ...SESSAO_OUTRA, ativo: true, token: 'outro-token', criadoEm: new Date(), expiresAt: new Date() },
    ])

    const res = await app.inject({
      method: 'GET',
      url: '/sessoes',
      headers: { ...ORIGIN },
      cookies: { viu_token: token },
    })

    expect(res.statusCode).toBe(200)
    const data = res.json().data
    expect(data.find((s: any) => s.id === SESSAO_ATUAL.id).isCurrent).toBe(true)
    expect(data.find((s: any) => s.id === SESSAO_OUTRA.id).isCurrent).toBe(false)
    // O token nunca sai na resposta, nem para o dono da sessão.
    expect(data.every((s: any) => s.token === undefined)).toBe(true)
  })

  it('sem token → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/sessoes', headers: { ...ORIGIN } })
    expect(res.statusCode).toBe(401)
  })
})

describe('DELETE /sessoes/:id', () => {
  it('recusa revogar a própria sessão pelo cookie → 400', async () => {
    db.sessao.findUnique.mockResolvedValue({ ...SESSAO_ATUAL, usuarioId: DESIGNER.id, token })

    const res = await app.inject({
      method: 'DELETE',
      url: `/sessoes/${SESSAO_ATUAL.id}`,
      headers: { ...ORIGIN },
      cookies: { viu_token: token },
    })

    expect(res.statusCode).toBe(400)
    expect(db.sessao.update).not.toHaveBeenCalled()
  })

  it('revoga outra sessão do próprio usuário → 200', async () => {
    db.sessao.findUnique.mockResolvedValue({
      ...SESSAO_OUTRA,
      usuarioId: DESIGNER.id,
      token: 'token-de-outro-dispositivo',
    })
    db.sessao.update.mockResolvedValue({ ...SESSAO_OUTRA, ativo: false })

    const res = await app.inject({
      method: 'DELETE',
      url: `/sessoes/${SESSAO_OUTRA.id}`,
      headers: { ...ORIGIN },
      cookies: { viu_token: token },
    })

    expect(res.statusCode).toBe(200)
    expect(db.sessao.update).toHaveBeenCalled()
  })

  it('não revoga sessão de outro usuário → 404', async () => {
    db.sessao.findUnique.mockResolvedValue({
      ...SESSAO_OUTRA,
      usuarioId: DESIGNER_B.id,
      token: 'token-da-vitima',
    })

    const res = await app.inject({
      method: 'DELETE',
      url: `/sessoes/${SESSAO_OUTRA.id}`,
      headers: { ...ORIGIN },
      cookies: { viu_token: token },
    })

    // 404 e não 403: quem não é dono não deve nem confirmar que a sessão existe.
    expect(res.statusCode).toBe(404)
    expect(db.sessao.update).not.toHaveBeenCalled()
  })
})

describe('POST /sessoes/revoke-others', () => {
  it('funciona com sessão por cookie e preserva a sessão atual', async () => {
    db.sessao.updateMany.mockResolvedValue({ count: 2 })

    const res = await app.inject({
      method: 'POST',
      url: '/sessoes/revoke-others',
      headers: { ...ORIGIN },
      cookies: { viu_token: token },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().data.count).toBe(2)
    expect(db.sessao.updateMany).toHaveBeenCalledWith({
      where: { usuarioId: DESIGNER.id, ativo: true, NOT: { token } },
      data: { ativo: false },
    })
  })

  it('funciona também com Authorization: Bearer', async () => {
    db.sessao.updateMany.mockResolvedValue({ count: 1 })

    const res = await app.inject({
      method: 'POST',
      url: '/sessoes/revoke-others',
      headers: { authorization: `Bearer ${token}`, ...ORIGIN },
    })

    expect(res.statusCode).toBe(200)
    expect(db.sessao.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ NOT: { token } }) }),
    )
  })
})
