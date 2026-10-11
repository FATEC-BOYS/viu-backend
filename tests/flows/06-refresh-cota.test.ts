import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  return { default: criarPrismaMock() }
})

// ── Imports ───────────────────────────────────────────────────────────────────

import prisma from '../../src/database/client.js'
import { buildServer } from '../../src/index.js'
import { ORIGIN } from '../helpers/token.js'
import { limparTetoDeRefresh } from '../../src/routes/auth.js'

const db = prisma as any

/**
 * A cota do /auth/refresh é de cada sessão, não do endereço de onde ela vem.
 *
 * O `keyGenerator` global chaveia pelo cookie do token de ACESSO — que nesta
 * rota, por definição, já venceu e não é mais enviado pelo navegador. A chave
 * caía no IP; e atrás de um proxy (Railway) o IP é o mesmo para todo mundo,
 * então eram 20 renovações por 15 minutos para a plataforma inteira: uma
 * pessoa renovando deslogava as outras, sem que nenhuma tivesse feito nada.
 *
 * Medido antes da correção, com duas contas diferentes alternando:
 * x-ratelimit-remaining caiu 19, 18, 17, 16, 15, 14 — um balde só.
 */
describe('cota do refresh é por sessão, não por IP', () => {
  let app: FastifyInstance

  beforeEach(() => {
    // A janela por IP é estado de módulo e atravessa testes.
    limparTetoDeRefresh()
  })

  beforeAll(async () => {
    app = await buildServer()
    await app.ready()
    // Sem sessão no banco toda tentativa dá 401 — e o limitador conta as
    // tentativas de qualquer jeito, que é justamente o que se quer medir.
    db.sessao.findFirst.mockResolvedValue(null)
  })

  it('mais tentativas que a cota, vindas de sessões distintas, não esbarram no limite', async () => {
    const LIMITE_DA_ROTA = 20
    const status: number[] = []

    for (let i = 0; i <= LIMITE_DA_ROTA; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        headers: { ...ORIGIN, 'content-type': 'application/json' },
        payload: '',
        cookies: { viu_refresh_token: `refresh-de-quem-${i}` },
      })
      status.push(res.statusCode)
    }

    // Todas as injeções saem do mesmo IP: se a chave fosse o endereço, a de
    // número 21 voltaria 429 e a pessoa seria mandada ao login por causa do
    // vizinho.
    expect(status).toHaveLength(LIMITE_DA_ROTA + 1)
    expect(status.filter((s) => s === 429)).toEqual([])
  })

  it('a mesma sessão insistindo continua limitada', async () => {
    const status: number[] = []

    for (let i = 0; i <= 20; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        headers: { ...ORIGIN, 'content-type': 'application/json' },
        payload: '',
        cookies: { viu_refresh_token: 'sempre-o-mesmo-token' },
      })
      status.push(res.statusCode)
    }

    // A cota existe para conter força bruta em cima de um token, e isso segue
    // valendo: o que mudou é só quem divide o balde com quem.
    expect(status).toContain(429)
  })

  /*
   * A cota por token é chaveada por um COOKIE, e cookie quem escolhe é quem
   * chama. Sem um teto por IP, bastava variar o valor a cada requisição para
   * ganhar um balde novo toda vez — a rota ficaria sem limite algum, com cada
   * tentativa ainda indo ao banco antes de ser recusada.
   *
   * Apontado na revisão do PR #110, conferido aqui.
   */
  it('variar o cookie a cada chamada não escapa do teto por IP', async () => {
    const TETO = 120
    let ultimo = 0

    for (let i = 0; i <= TETO; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        headers: { ...ORIGIN, 'content-type': 'application/json' },
        payload: '',
        // Um token inventado por requisição: é o que um atacante faria.
        cookies: { viu_refresh_token: `inventado-${i}-${Math.random()}` },
      })
      ultimo = res.statusCode
    }

    expect(ultimo).toBe(429)
  })
})
