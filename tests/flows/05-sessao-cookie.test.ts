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

vi.mock('../../src/utils/storage.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/utils/storage.js')>()
  return { ...original, assinarAvatar: vi.fn().mockResolvedValue(null) }
})

// ── Imports ───────────────────────────────────────────────────────────────────

import prisma from '../../src/database/client.js'
import { assinarAvatar } from '../../src/utils/storage.js'
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

  /*
   * O navegador manda `Content-Type: application/json` por hábito e corpo
   * nenhum — o refresh token vem do cookie, não há o que enviar.
   *
   * O parser padrão do Fastify recusa essa combinação com 400 ("Body cannot be
   * empty") ANTES de a rota rodar, e o cliente HTTP lê o 400 como "sua sessão
   * acabou". Era isso que deslogava quem estava logado: a renovação nunca
   * chegava a ser tentada.
   *
   * O teste acima não pegou porque injeta a requisição SEM Content-Type —
   * exatamente a forma que o navegador nunca manda. Daí a suíte verde com o
   * produto quebrado.
   */
  it('refresh aceita Content-Type de JSON com corpo vazio, que é o que o navegador manda', async () => {
    db.sessao.findFirst.mockResolvedValue({
      id: 'csessao000000002',
      usuarioId: DESIGNER.id,
      usuario: { ...USUARIO_DB },
    })
    db.sessao.update.mockResolvedValue({})
    db.sessao.create.mockResolvedValue({})

    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: { ...ORIGIN, 'content-type': 'application/json' },
      payload: '',
      cookies: { viu_refresh_token: 'refresh-valido' },
    })

    expect(res.statusCode).toBe(200)
    expect(pegarCookie(res, 'viu_token')?.httpOnly).toBe(true)
  })

  it('corpo vazio é tolerado, JSON malformado não', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: { ...ORIGIN, 'content-type': 'application/json' },
      payload: '{isso nao e json',
      cookies: { viu_refresh_token: 'refresh-valido' },
    })

    expect(res.statusCode).toBe(400)
  })

  /*
   * Recusar um refresh NÃO pode apagar os cookies, e a razão é uma corrida.
   *
   * Este teste afirmava o contrário, sob a premissa de que "refresh que falhou
   * é sessão morta". A premissa é falsa justamente quando mais custa: renovar
   * ROTACIONA, e o motivo mais comum de uma recusa é o token já ter sido
   * trocado — isto é, outra requisição renovou com sucesso um instante antes.
   * Apagar ali destrói a sessão NOVA, que estava viva.
   *
   * Medido no navegador: `refresh=[200, 401]` numa única onda, e a pessoa
   * caindo no login logo depois de o servidor ter criado uma sessão boa. Com
   * duas abas isso não tem defesa possível do lado do cliente — cada aba é um
   * módulo com sua própria memória —, então a defesa é aqui.
   */
  it('ausência de refresh é uma recusa de autenticação, não erro de infraestrutura', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/refresh', headers: { ...ORIGIN } })
    expect(res.statusCode).toBe(401)
    expect(res.cookies).toHaveLength(0)
    expect(db.sessao.findFirst).not.toHaveBeenCalled()
  })

  it('indisponibilidade do banco não se apresenta como sessão inválida', async () => {
    db.sessao.findFirst.mockRejectedValueOnce(new Error('database connection timeout'))
    const res = await app.inject({
      method: 'POST', url: '/auth/refresh', headers: { ...ORIGIN },
      cookies: { viu_refresh_token: 'refresh-temporariamente-indisponivel' },
    })
    expect(res.statusCode).toBe(503)
    expect(res.headers['retry-after']).toBe('3')
    expect(res.body).not.toContain('database connection')
    expect(res.cookies).toHaveLength(0)
    expect(db.sessao.update).not.toHaveBeenCalled()
  })

  it('falha ao assinar avatar preserva a sessão anterior para nova tentativa', async () => {
    db.sessao.findFirst.mockResolvedValue({
      id: 'sessao-avatar', usuarioId: DESIGNER.id, usuario: { ...USUARIO_DB, avatar: 'avatar.png' },
    })
    vi.mocked(assinarAvatar).mockRejectedValueOnce(new Error('storage unavailable'))
    const res = await app.inject({
      method: 'POST', url: '/auth/refresh', headers: { ...ORIGIN },
      cookies: { viu_refresh_token: 'refresh-avatar' },
    })
    expect(res.statusCode).toBe(503)
    expect(res.cookies).toHaveLength(0)
    expect(db.$transaction).not.toHaveBeenCalled()
    expect(db.sessao.update).not.toHaveBeenCalled()

    const recuperada = await app.inject({
      method: 'POST', url: '/auth/refresh', headers: { ...ORIGIN },
      cookies: { viu_refresh_token: 'refresh-avatar' },
    })
    expect(recuperada.statusCode).toBe(200)
    expect(pegarCookie(recuperada, 'viu_refresh_token')?.httpOnly).toBe(true)
  })

  it('refresh recusado não apaga os cookies: pode haver sessão nova e viva', async () => {
    db.sessao.findFirst.mockResolvedValue(null)

    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: { ...ORIGIN, 'content-type': 'application/json' },
      payload: '',
      cookies: { viu_refresh_token: 'ja-rotacionado' },
    })

    expect(res.statusCode).toBe(401)
    // Nenhum Set-Cookie: o que estiver no navegador continua lá. Um cookie
    // morto custa um 401 a mais, que o cliente trata; um cookie vivo apagado
    // custa a sessão de quem não errou nada.
    expect(pegarCookie(res, 'viu_token')).toBeUndefined()
    expect(pegarCookie(res, 'viu_refresh_token')).toBeUndefined()
  })

  it('logout, esse sim, apaga os cookies', async () => {
    db.sessao.updateMany.mockResolvedValue({ count: 1 })
    const res = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { ...ORIGIN, 'content-type': 'application/json' },
      payload: '',
      cookies: { viu_token: 'qualquer' },
    })

    // A diferença é intenção: aqui a pessoa PEDIU para sair.
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
