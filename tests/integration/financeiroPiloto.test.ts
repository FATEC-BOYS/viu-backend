import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  return { default: criarPrismaMock() }
})
import prisma from '../../src/database/client.js'
import { buildServer } from '../../src/index.js'
import { env } from '../../src/config/env.js'
import { requirePlanLimit } from '../../src/middleware/planLimitMiddleware.js'
import { makeToken, DESIGNER, CLIENTE, ADMIN, ORIGIN } from '../helpers/token.js'

let app: FastifyInstance
const original = env.FINANCEIRO_APENAS_ADMIN
beforeAll(async () => {
  env.FINANCEIRO_APENAS_ADMIN = true
  app = await buildServer()
  await app.ready()
})
afterAll(async () => { await app.close(); env.FINANCEIRO_APENAS_ADMIN = original })
beforeEach(() => { vi.clearAllMocks(); vi.mocked(prisma.sessao.findFirst).mockResolvedValue({ id: 's1' } as any) })

const caminhos = [
  '/planos', '/planos/plano1', '/assinaturas/minha', '/faturas', '/faturas/f1',
  '/saques', '/saques/saldo', '/chaves-pix', '/ledger', '/dados-fiscais', '/disputas',
  '/projetos/p1/contrato', '/projetos/p1/contrato/versoes', '/projetos/p1/termos',
  '/projetos/p1/anexo/preview', '/aceites/projetos/p1',
]
describe('piloto com comercial só para ADM', () => {
  for (const user of [DESIGNER, CLIENTE]) {
    it.each(caminhos)(`${user.tipo} não acessa %s pela API`, async url => {
      const res = await app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${await makeToken(user)}`, ...ORIGIN } })
      expect(res.statusCode).toBe(403)
      expect(res.json().message).toContain('piloto')
    })
    it(`${user.tipo} não inicia cobrança, saque ou contrato`, async () => {
      for (const url of ['/projetos/p1/fatura', '/faturas/f1/pagar/pix', '/saques', '/chaves-pix', '/assinaturas', '/projetos/p1/contrato', '/contratos/c1/aceite']) {
        const res = await app.inject({ method: 'POST', url, payload: {}, headers: { authorization: `Bearer ${await makeToken(user)}`, ...ORIGIN } })
        expect(res.statusCode, url).toBe(403)
      }
      expect(prisma.fatura.create).not.toHaveBeenCalled()
      expect(prisma.contratoProjeto.create).not.toHaveBeenCalled()
    })
    it(`${user.tipo} segue consultando projetos e artes`, async () => {
      for (const url of ['/projetos', '/artes']) {
        const res = await app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${await makeToken(user)}`, ...ORIGIN } })
        expect(res.statusCode, url).toBe(200)
      }
    })
    it(`${user.tipo} não é limitado por plano no piloto`, async () => {
      const reply = { status: vi.fn().mockReturnThis(), send: vi.fn() }
      await requirePlanLimit('projetos')({ usuario: user } as any, reply as any)
      expect(prisma.assinatura.findFirst).not.toHaveBeenCalled()
      expect(prisma.projeto.count).not.toHaveBeenCalled()
      expect(reply.status).not.toHaveBeenCalled()
    })
  }
  it('não publica planos para visitantes', async () => {
    expect((await app.inject({ method: 'GET', url: '/planos', headers: { ...ORIGIN } })).statusCode).toBe(401)
  })
  it('ADM mantém acesso ao catálogo e faturas', async () => {
    for (const url of ['/planos', '/faturas']) {
      const res = await app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${await makeToken(ADMIN)}`, ...ORIGIN } })
      expect(res.statusCode).toBe(200)
    }
  })
  it('contagem de avisos exclui financeiro para o cliente', async () => {
    const res = await app.inject({ method: 'GET', url: '/notificacoes', headers: { authorization: `Bearer ${await makeToken(CLIENTE)}`, ...ORIGIN } })
    expect(res.statusCode).toBe(200)
    for (const [args] of vi.mocked(prisma.notificacao.count).mock.calls as any) {
      expect(args.where.NOT.tipo.in).toContain('FATURA_GERADA')
    }
  })
})
