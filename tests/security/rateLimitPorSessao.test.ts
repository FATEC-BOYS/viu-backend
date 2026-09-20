/**
 * A cota do limite global é de cada sessão, não do endereço de onde ela vem.
 *
 * Sem `keyGenerator`, o `@fastify/rate-limit` chaveia por IP. Duas pessoas do
 * mesmo escritório — ou dois celulares atrás do CGNAT da operadora — dividiam
 * os mesmos 100 por 15 minutos: uma navegando derrubava a outra, sem que
 * nenhuma tivesse feito nada demais.
 *
 * Este teste prende as duas metades da regra. Sem ele, tirar o `keyGenerator`
 * numa refatoração não quebra nada visível: o app continua respondendo, e o
 * estrago só aparece em produção, num escritório, como "preciso esperar 15
 * minutos".
 */
import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'

/*
 * Teto baixo ANTES de qualquer import: `env` é lido uma vez, no carregamento
 * do módulo. Com o teto real (600) nenhuma bateria curta chega no 429 e o
 * teste passaria mesmo com a chave por IP — que foi como ele passou na
 * primeira tentativa, provando nada.
 */
vi.hoisted(() => {
  process.env.RATE_LIMIT_MAX = '5'
  process.env.RATE_LIMIT_WINDOW = '15 minutes'
})

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  const mock = criarPrismaMock()
  return { default: mock, prisma: mock }
})

import { buildServer } from '../../src/index.js'
import { COOKIE_TOKEN } from '../../src/utils/authCookies.js'

const ORIGEM = { origin: 'http://localhost:3000' }

let app: FastifyInstance

beforeAll(async () => {
  app = await buildServer()
  await app.ready()
})
afterAll(async () => {
  await app.close()
})

const TETO = 5

/** Bate numa rota real até tomar 429. Devolve quantas passaram. */
async function gastarCota(cookie: string | null, tentativas: number) {
  let passaram = 0
  for (let i = 0; i < tentativas; i++) {
    const res = await app.inject({
      method: 'GET',
      // Rota que existe de verdade: num 404 o gancho do limitador pode nem
      // rodar, e aí a contagem não mede o que o teste diz medir.
      url: '/planos',
      headers: {
        ...ORIGEM,
        ...(cookie ? { cookie: `${COOKIE_TOKEN}=${cookie}` } : {}),
        // Mesmo IP para todo mundo: é exatamente o cenário do escritório.
        'x-forwarded-for': '203.0.113.7',
      },
    })
    if (res.statusCode === 429) break
    passaram++
  }
  return passaram
}

describe('Limite global por sessão', () => {
  it('a sessão gasta a própria cota e é barrada ao fim dela', async () => {
    const passaram = await gastarCota('sessao-da-ana', TETO + 3)
    expect(passaram).toBe(TETO)
  })

  it('a cota de uma sessão não consome a da outra, no mesmo IP', async () => {
    // A primeira já esgotou a dela no teste acima, no mesmo endereço. Se a
    // chave fosse o IP, esta aqui nasceria sem nenhuma cota.
    const passaram = await gastarCota('sessao-do-joao', TETO + 3)
    expect(passaram).toBe(TETO)
  })

  it('sem cookie, ainda é o IP que responde pela cota', async () => {
    // Quem não entrou não tem sessão para chamar de sua — e aí o endereço é a
    // única identidade disponível. Vem de outro IP para não herdar o que as
    // sessões acima gastaram.
    let passaram = 0
    for (let i = 0; i < TETO + 3; i++) {
      const res = await app.inject({
        method: 'GET',
        url: '/planos',
        headers: { ...ORIGEM, 'x-forwarded-for': '198.51.100.4' },
      })
      if (res.statusCode === 429) break
      passaram++
    }
    expect(passaram).toBe(TETO)
  })
})
