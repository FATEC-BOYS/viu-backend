import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  return { default: criarPrismaMock() }
})

vi.mock('bcryptjs', () => ({
  default: {
    compare: vi.fn().mockResolvedValue(true),
    hash: vi.fn().mockResolvedValue('hash'),
  },
}))

// ── Imports ───────────────────────────────────────────────────────────────────

import prisma from '../../src/database/client.js'
import { buildServer } from '../../src/index.js'
import { makeToken, DESIGNER, ORIGIN } from '../helpers/token.js'

const db = prisma as any

const USUARIO_DB = {
  id: DESIGNER.id,
  email: DESIGNER.email,
  senha: '$2a$10$hashfake',
  nome: DESIGNER.nome,
  tipo: DESIGNER.tipo,
  avatar: null,
  ativo: true,
  twoFactorEnabled: false,
  emailVerificado: true,
}

/** Lê um cookie específico do conjunto de Set-Cookie da resposta. */
function pegarCookie(res: { cookies: any[] }, nome: string) {
  return res.cookies.find((c: any) => c.name === nome)
}

describe('sessão por cookie HttpOnly', () => {
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
  })

  it('login grava os dois cookies como HttpOnly e não devolve token no corpo', async () => {
    db.usuario.findUnique.mockResolvedValue(USUARIO_DB)
    db.sessao.create.mockResolvedValue({})

    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { ...ORIGIN },
      payload: { email: DESIGNER.email, senha: 'SenhaQualquer#1' },
    })

    expect(res.statusCode).toBe(200)

    const corpo = res.json()
    expect(corpo.data.usuario).toMatchObject({ id: DESIGNER.id })
    // O ponto da migração: o token não passa por onde o JavaScript da página lê.
    expect(corpo.data.token).toBeUndefined()
    expect(corpo.data.refreshToken).toBeUndefined()

    const token = pegarCookie(res, 'viu_token')
    const refresh = pegarCookie(res, 'viu_refresh_token')
    expect(token?.httpOnly).toBe(true)
    expect(refresh?.httpOnly).toBe(true)
    expect(token?.path).toBe('/')
    // O cookie expira junto com o token no banco.
    expect(token?.expires).toBeInstanceOf(Date)
  })

  it('conta com 2FA não abre sessão nem grava cookie no login', async () => {
    db.usuario.findUnique.mockResolvedValue({ ...USUARIO_DB, twoFactorEnabled: true })

    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { ...ORIGIN },
      payload: { email: DESIGNER.email, senha: 'SenhaQualquer#1' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().data.requires2FA).toBe(true)
    expect(pegarCookie(res, 'viu_token')).toBeUndefined()
    expect(db.sessao.create).not.toHaveBeenCalled()
  })

  it('requisição autenticada só pelo cookie é aceita', async () => {
    db.sessao.findFirst.mockResolvedValue({ id: 'csessao000000001' })
    db.usuario.findUnique.mockResolvedValue({
      id: DESIGNER.id,
      email: DESIGNER.email,
      nome: DESIGNER.nome,
      tipo: DESIGNER.tipo,
    })

    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { ...ORIGIN },
      cookies: { viu_token: await makeToken(DESIGNER) },
    })

    expect(res.statusCode).toBe(200)
  })

  it('refresh lê o cookie, rotaciona a sessão e não devolve token no corpo', async () => {
    db.sessao.findFirst.mockResolvedValue({
      id: 'csessao000000001',
      usuarioId: DESIGNER.id,
      usuario: { ...USUARIO_DB },
    })
    db.sessao.update.mockResolvedValue({})
    db.sessao.create.mockResolvedValue({})

    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: { ...ORIGIN },
      cookies: { viu_refresh_token: 'refresh-valido' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().data.token).toBeUndefined()
    expect(pegarCookie(res, 'viu_token')?.httpOnly).toBe(true)
    // Sessão anterior é desativada e uma nova é criada — o refresh rotaciona.
    expect(db.sessao.update).toHaveBeenCalled()
    expect(db.sessao.create).toHaveBeenCalled()
  })

  it('refresh inválido limpa os cookies em vez de deixar sessão morta no navegador', async () => {
    db.sessao.findFirst.mockResolvedValue(null)

    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: { ...ORIGIN },
      cookies: { viu_refresh_token: 'ja-usado' },
    })

    expect(res.statusCode).toBe(401)
    expect(pegarCookie(res, 'viu_token')?.value).toBe('')
    expect(pegarCookie(res, 'viu_refresh_token')?.value).toBe('')
  })

  it('logout revoga a sessão do cookie e apaga os cookies', async () => {
    db.sessao.updateMany.mockResolvedValue({ count: 1 })
    const token = await makeToken(DESIGNER)

    const res = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { ...ORIGIN },
      cookies: { viu_token: token },
    })

    expect(res.statusCode).toBe(200)
    expect(db.sessao.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { token }, data: { ativo: false } }),
    )
    expect(pegarCookie(res, 'viu_token')?.value).toBe('')
  })
})
