import { beforeAll, afterAll, beforeEach, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
vi.mock('../../src/database/client.js', async () => { const { criarPrismaMock } = await import('../helpers/prismaMock.js'); const db = criarPrismaMock(); return { default: db, prisma: db } })
vi.mock('../../src/services/transcricaoService.js', () => ({ transcreverAudio: vi.fn().mockResolvedValue('Talvez aumentar o título.'), sintetizarTexto: vi.fn() }))
import prisma from '../../src/database/client.js'
import { sugerirAjustes } from '../../src/services/ajustesService.js'
vi.mock('../../src/services/ajustesService.js', () => ({ sugerirAjustes: vi.fn().mockResolvedValue({ ajustes: [] }) }))
import { criarSugestaoAjustes } from '../../src/controllers/ajustesController.js'
import { buildServer } from '../../src/index.js'
import { CLIENTE, ORIGIN } from '../helpers/token.js'
const db = prisma as any
let app: FastifyInstance
beforeAll(async () => { app = await buildServer(); await app.ready() })
afterAll(async () => { await app.close() })
beforeEach(() => {
  vi.clearAllMocks()
  db.sessao.findFirst.mockResolvedValue({ id: 'sessao' })
  db.arte.findUnique.mockResolvedValue({ id: 'arte', versao: 2, projeto: { designerId: 'designer', clienteId: CLIENTE.id } })
})
it.each(['/feedbacks/ajustes/rascunho', '/links/token/feedbacks/ajustes/rascunho'])('exige sessão: %s', async url => {
  expect((await app.inject({ method: 'POST', url, headers: ORIGIN })).statusCode).toBe(401)
  expect(sugerirAjustes).not.toHaveBeenCalled()
})
function request(over = {}) {
  return { usuario: CLIENTE, params: {}, body: { arteId: 'arte', versaoNumero: 2, texto: 'Talvez aumentar o título.' }, log: { warn: vi.fn(), error: vi.fn() }, ...over } as any
}
async function chamar(req: any) {
  const reply = { statusCode: 200, body: null as any, status: vi.fn(function(this: any, code) { this.statusCode = code; return this }), send: vi.fn(function(this: any, body) { this.body = body; return this }) }
  await criarSugestaoAjustes(req, reply as any)
  return reply
}
it('sugere sem criar feedback ou tarefa', async () => {
  const reply = await chamar(request())
  expect(reply.statusCode).toBe(200)
  expect(db.feedback.create).not.toHaveBeenCalled()
})
it('nega outro projeto antes de chamar IA', async () => {
  db.arte.findUnique.mockResolvedValue({ id: 'arte', versao: 2, projeto: { designerId: 'outro', clienteId: 'outra' } })
  expect((await chamar(request())).statusCode).toBe(403)
  expect(sugerirAjustes).not.toHaveBeenCalled()
})
it('respeita link somente leitura', async () => {
  db.linkCompartilhado.findUnique.mockResolvedValue({ tipo: 'ARTE', arteId: 'arte', somenteLeitura: true, revogado: false, expiraEm: null, limiteTentativas: null })
  expect((await chamar(request({ params: { token: 'token' } }))).statusCode).toBe(403)
  expect(sugerirAjustes).not.toHaveBeenCalled()
})
it('nega outra arte no link', async () => {
  db.linkCompartilhado.findUnique.mockResolvedValue({ tipo: 'ARTE', arteId: 'outra', somenteLeitura: false, revogado: false, expiraEm: null, limiteTentativas: null })
  expect((await chamar(request({ params: { token: 'token' } }))).statusCode).toBe(403)
  expect(sugerirAjustes).not.toHaveBeenCalled()
})
it('recusa versão antiga e texto excessivo', async () => {
  const req = request(); req.body.versaoNumero = 1
  expect((await chamar(req)).statusCode).toBe(409)
  req.body.texto = 'a'.repeat(10001)
  expect((await chamar(req)).statusCode).toBe(400)
  expect(sugerirAjustes).not.toHaveBeenCalled()
})
it('falha sem expor configuração ou perder texto', async () => {
  vi.mocked(sugerirAjustes).mockRejectedValueOnce(new Error('OPENAI_API_KEY ausente'))
  const reply = await chamar(request())
  expect(reply.statusCode).toBe(503)
  expect(reply.body.message).not.toContain('OPENAI_API_KEY')
  expect(db.feedback.create).not.toHaveBeenCalled()
})
