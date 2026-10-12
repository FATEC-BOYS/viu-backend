/**
 * Ouvir um comentário pelo link SOMENTE-LEITURA — que é o link padrão.
 *
 * `GET /links/:token/feedbacks/:id/audio` nasceu usando
 * `resolveArteIdFromToken`, que serve ao caminho de COMENTAR e por isso
 * recusa link somente-leitura. Como o assistente cria os links com
 * `somenteLeitura: true`, o botão de ouvir respondia 500 em TODO link padrão
 * — justamente os que vão para o WhatsApp, que é onde ouvir em vez de ler
 * mais serve.
 *
 * Passou despercebido porque a verificação manual foi feita com um link
 * criado com `somenteLeitura: false`: o caminho favorável respondia 503 (só
 * faltava a chave da OpenAI) e parecia certo. Este teste existe para que a
 * próxima mudança nessa rota seja medida pelo caso REAL.
 */
import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  // Nomeado além do default: `linkService` importa pelo nome.
  const mock = criarPrismaMock()
  return { default: mock, prisma: mock }
})

// Sem isto a síntese tentaria a OpenAI de verdade. O que este arquivo mede é
// se a rota CHEGA até ela — não o que ela devolve.
vi.mock('../../src/services/transcricaoService.js', () => ({
  transcreverAudio: vi.fn().mockResolvedValue('texto'),
  sintetizarTexto: vi.fn().mockResolvedValue(Buffer.from('mp3 sintetizado')),
}))

vi.mock('../../src/utils/storage.js', () => ({
  uploadFile: vi.fn().mockResolvedValue(undefined),
  deleteFile: vi.fn().mockResolvedValue(undefined),
  signPath: vi.fn(async (p: string | null) => (p ? `https://r2.test/${p}?assinado` : null)),
  signPaths: vi.fn().mockResolvedValue([]),
  lerArquivo: vi.fn().mockResolvedValue(null),
  assinarAvatar: vi.fn().mockResolvedValue(null),
}))

import prisma from '../../src/database/client.js'
import { buildServer } from '../../src/index.js'
import { makeToken, CLIENTE, ORIGIN } from '../helpers/token.js'

const db = prisma as any

const TOKEN = 'b'.repeat(48)
const ARTE_ID = 'carte00000000000002'
const FEEDBACK_ID = 'cfb00000000000000002'

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

/** O link como o assistente o cria: somente-leitura. */
function linkSomenteLeitura(over: Record<string, unknown> = {}) {
  db.linkCompartilhado.findUnique.mockResolvedValue({
    id: 'clink00000000000002',
    token: TOKEN,
    tipo: 'ARTE',
    arteId: ARTE_ID,
    somenteLeitura: true,
    revogado: false,
    expiraEm: null,
    limiteTentativas: null,
    acessos: 1,
    ...over,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  db.sessao.findFirst.mockResolvedValue({ id: 'csessao000000000000000002' })
  linkSomenteLeitura()
  db.feedback.findUnique.mockResolvedValue({
    id: FEEDBACK_ID,
    arteId: ARTE_ID,
    conteudo: 'O azul do fundo ficou pesado',
    publico: true,
    audioGerado: null,
  })
  db.feedback.update.mockResolvedValue({})
})

describe('GET /links/:token/feedbacks/:id/audio', () => {
  it('o link somente-leitura — que é o padrão — consegue ouvir', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/links/${TOKEN}/feedbacks/${FEEDBACK_ID}/audio`,
      headers: { ...ORIGIN },
      cookies: { viu_token: jwt },
    })

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('audio/mpeg')
    expect(res.rawPayload.toString()).toBe('mp3 sintetizado')
  })

  /*
   * Ler continua exigindo um link VÁLIDO: o que muda é só a restrição de
   * escrita, que nunca teve o que fazer aqui.
   */
  it('link revogado continua recusado', async () => {
    linkSomenteLeitura({ revogado: true })
    const res = await app.inject({
      method: 'GET',
      url: `/links/${TOKEN}/feedbacks/${FEEDBACK_ID}/audio`,
      headers: { ...ORIGIN },
      cookies: { viu_token: jwt },
    })
    expect(res.statusCode).toBe(404)
  })

  it('link expirado continua recusado', async () => {
    linkSomenteLeitura({ expiraEm: new Date('2020-01-01T00:00:00.000Z') })
    const res = await app.inject({
      method: 'GET',
      url: `/links/${TOKEN}/feedbacks/${FEEDBACK_ID}/audio`,
      headers: { ...ORIGIN },
      cookies: { viu_token: jwt },
    })
    expect(res.statusCode).toBe(404)
  })

  /*
   * O token autoriza AQUELA arte. Um id de comentário de outra arte, mesmo
   * existindo no banco, não é alcançável por este link.
   */
  it('comentário de outra arte não é alcançável pelo token', async () => {
    db.feedback.findUnique.mockResolvedValue({
      id: FEEDBACK_ID,
      arteId: 'coutra0000000000001',
      conteudo: 'de outra arte',
      publico: true,
      audioGerado: null,
    })
    const res = await app.inject({
      method: 'GET',
      url: `/links/${TOKEN}/feedbacks/${FEEDBACK_ID}/audio`,
      headers: { ...ORIGIN },
      cookies: { viu_token: jwt },
    })
    expect(res.statusCode).toBe(404)
  })

  it('sem sessão → 401: sintetizar custa dinheiro, e o gatilho é a conta', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/links/${TOKEN}/feedbacks/${FEEDBACK_ID}/audio`,
      headers: { ...ORIGIN },
    })
    expect(res.statusCode).toBe(401)
  })
})
