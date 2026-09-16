/**
 * Comentar exige conta — nas duas portas, e por escrito.
 *
 * `GET /preview/:token` é público de propósito: o link é a forma como o
 * cliente recebe a arte, e ler não pode depender de cadastro. Escrever é
 * outra coisa. O token diz "esta arte pode ser vista por quem tiver este
 * endereço"; ele nunca disse "quem tiver este endereço pode escrever aqui".
 *
 * Isto já era verdade no código (`authenticate` no preHandler das duas rotas
 * de feedback, e o autor saindo de `usuario.id`, nunca do corpo). O que
 * faltava era um teste prendendo a regra: sem isto, tirar o `authenticate`
 * numa refatoração futura não quebra nada visível — abre o produto para
 * script.
 */
import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  // `prisma` nomeado além do default: `linkService` importa pelo nome, e só o
  // default deixa a rota estourar 500 dentro do teste de segurança.
  const mock = criarPrismaMock()
  return { default: mock, prisma: mock }
})

import prisma from '../../src/database/client.js'
import { buildServer } from '../../src/index.js'
import { makeToken, CLIENTE, ORIGIN } from '../helpers/token.js'

const db = prisma as any

const TOKEN_DO_LINK = 'a'.repeat(48)
const ARTE = {
  id: 'carte00000000000001',
  nome: 'Cartaz',
  autorId: 'cdesigner000000001',
  versao: 2,
  projeto: { designerId: 'cdesigner000000001', clienteId: CLIENTE.id },
}

let app: FastifyInstance
let jwt: string

beforeAll(async () => {
  app = await buildServer()
  await app.ready()
  jwt = await makeToken(CLIENTE)
})

afterAll(async () => {
  await app.close()
})

beforeEach(() => {
  vi.clearAllMocks()
  // Sessão viva — o `authenticate` confere a linha no banco, não só o JWT.
  db.sessao.findFirst.mockResolvedValue({ id: 'csessao000000000000000001' })

  db.linkCompartilhado.findUnique.mockResolvedValue({
    id: 'clink00000000000001',
    token: TOKEN_DO_LINK,
    tipo: 'ARTE',
    arteId: ARTE.id,
    somenteLeitura: false,
    revogado: false,
    expiraEm: null,
    limiteTentativas: null,
    acessos: 1,
  })
  db.arte.findUnique.mockResolvedValue(ARTE)
  db.usuario.findUnique.mockResolvedValue({ id: CLIENTE.id, nome: CLIENTE.nome })
  db.feedback.create.mockResolvedValue({ id: 'cfb00000000000000001', conteudo: 'oi' })
})

const CORPO = { conteudo: 'o logo está esticado', tipo: 'TEXTO' }

describe('POST /links/:token/feedbacks — a porta do link', () => {
  it('sem sessão → 401, e nada é gravado', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/links/${TOKEN_DO_LINK}/feedbacks`,
      headers: { ...ORIGIN },
      payload: CORPO,
    })

    expect(res.statusCode).toBe(401)
    expect(db.feedback.create).not.toHaveBeenCalled()
  })

  it('token válido não vale como credencial de escrita', async () => {
    // O link existe, não está revogado e permite comentário. Ainda assim, sem
    // conta não se escreve: quem autoriza a escrita é a sessão.
    const res = await app.inject({
      method: 'POST',
      url: `/links/${TOKEN_DO_LINK}/feedbacks`,
      headers: { ...ORIGIN },
      payload: CORPO,
    })

    expect(res.statusCode).toBe(401)
  })

  it('com sessão → 201, e o autor é o da sessão', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/links/${TOKEN_DO_LINK}/feedbacks`,
      headers: { ...ORIGIN },
      cookies: { viu_token: jwt },
      payload: CORPO,
    })

    expect(res.statusCode).toBe(201)
    const [argumentos] = db.feedback.create.mock.calls[0] as [any]
    expect(argumentos.data.autorId).toBe(CLIENTE.id)
  })

  it('o autor não pode ser escolhido pelo corpo da requisição', async () => {
    await app.inject({
      method: 'POST',
      url: `/links/${TOKEN_DO_LINK}/feedbacks`,
      headers: { ...ORIGIN },
      cookies: { viu_token: jwt },
      payload: { ...CORPO, autorId: 'cdesigner000000001', guestEmail: 'bot@x.com' },
    })

    const [argumentos] = db.feedback.create.mock.calls[0] as [any]
    expect(argumentos.data.autorId).toBe(CLIENTE.id)
  })
})

describe('POST /links/:token/feedbacks/audio — a mesma porta, com arquivo', () => {
  it('sem sessão → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/links/${TOKEN_DO_LINK}/feedbacks/audio`,
      headers: { ...ORIGIN, 'content-type': 'multipart/form-data; boundary=xx' },
      payload: '--xx--',
    })

    expect(res.statusCode).toBe(401)
    expect(db.feedback.create).not.toHaveBeenCalled()
  })
})

describe('POST /feedbacks — a porta da conta', () => {
  it('sem sessão → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/feedbacks',
      headers: { ...ORIGIN },
      payload: { ...CORPO, arteId: ARTE.id },
    })

    expect(res.statusCode).toBe(401)
    expect(db.feedback.create).not.toHaveBeenCalled()
  })
})

describe('GET /preview/:token — ler continua público', () => {
  it('sem sessão, o preview não exige conta', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/preview/${TOKEN_DO_LINK}`,
      headers: { ...ORIGIN },
    })

    // Qualquer coisa menos 401: ler pelo link é a promessa do produto.
    expect(res.statusCode).not.toBe(401)
  })
})
