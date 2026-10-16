import { beforeAll, afterAll, beforeEach, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
vi.mock('../../src/database/client.js', async () => { const { criarPrismaMock } = await import('../helpers/prismaMock.js'); const db = criarPrismaMock(); return { default: db, prisma: db } })
vi.mock('../../src/services/transcricaoService.js', () => ({ transcreverAudio: vi.fn().mockResolvedValue('Talvez aumentar o título.'), sintetizarTexto: vi.fn() }))
import prisma from '../../src/database/client.js'
import { transcreverAudio } from '../../src/services/transcricaoService.js'
import { criarRascunhoAudio } from '../../src/controllers/audioRascunhoController.js'
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
// As rotas devem recusar anônimos antes de processar upload ou chamar a API paga.
it.each(['/feedbacks/audio/rascunho', '/links/token/feedbacks/audio/rascunho'])('exige sessão: %s', async url => {
  const r = await app.inject({ method: 'POST', url, headers: ORIGIN })
  expect(r.statusCode).toBe(401)
  expect(transcreverAudio).not.toHaveBeenCalled()
})
function request(over = {}) {
  return { usuario: CLIENTE, params: {}, audioData: { buffer: Buffer.from('audio'), filename: 'fala.m4a', mimetype: 'audio/mp4', fields: { arteId: { value: 'arte' }, versaoNumero: { value: '2' } } }, log: { warn: vi.fn(), error: vi.fn() }, ...over } as any
}
async function chamar(req: any) {
  const reply = { statusCode: 200, body: null as any, status: vi.fn(function(this: any, code) { this.statusCode = code; return this }), send: vi.fn(function(this: any, body) { this.body = body; return this }) }
  await criarRascunhoAudio(req, reply as any)
  return reply
}
it('devolve transcrição e recibo, sem publicar feedback', async () => {
  const reply = await chamar(request())
  expect(reply.statusCode).toBe(200)
  expect(reply.body.data.transcricao).toBe('Talvez aumentar o título.')
  expect(db.feedback.create).not.toHaveBeenCalled()
})
it('nega projeto de outra pessoa antes da transcrição paga', async () => {
  db.arte.findUnique.mockResolvedValue({ id: 'arte', versao: 2, projeto: { designerId: 'outro', clienteId: 'outra' } })
  expect((await chamar(request())).statusCode).toBe(403)
  expect(transcreverAudio).not.toHaveBeenCalled()
})
it('respeita link somente leitura antes de transcrever', async () => {
  db.linkCompartilhado.findUnique.mockResolvedValue({ tipo: 'ARTE', arteId: 'arte', somenteLeitura: true, revogado: false, expiraEm: null, limiteTentativas: null })
  expect((await chamar(request({ params: { token: 'token' } }))).statusCode).toBe(403)
  expect(transcreverAudio).not.toHaveBeenCalled()
})
it('recusa versão antiga sem cobrar transcrição', async () => {
  const req = request(); req.audioData.fields.versaoNumero.value = '1'
  expect((await chamar(req)).statusCode).toBe(409)
  expect(transcreverAudio).not.toHaveBeenCalled()
})
it('retorna erro recuperável de transcrição sem publicar nem expor configuração', async () => {
  vi.mocked(transcreverAudio).mockRejectedValueOnce(new Error('OPENAI_API_KEY ausente'))
  const reply = await chamar(request())
  expect(reply.statusCode).toBe(503)
  expect(reply.body.message).not.toContain('OPENAI_API_KEY')
  expect(db.feedback.create).not.toHaveBeenCalled()
})

it('aceita multipart real pelo fluxo autenticado e devolve apenas rascunho', async () => {
  db.arte.findUnique.mockResolvedValue({ id: 'arte', projetoId: 'projeto', versao: 2, projeto: { designerId: 'designer', clienteId: CLIENTE.id } })
  const { makeToken } = await import('../helpers/token.js')
  const boundary = 'viu-test-boundary'
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="arteId"\r\n\r\narte\r\n--${boundary}\r\nContent-Disposition: form-data; name="versaoNumero"\r\n\r\n2\r\n--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="fala.webm"\r\nContent-Type: audio/webm\r\n\r\n`),
    Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ])
  const res = await app.inject({ method: 'POST', url: '/feedbacks/audio/rascunho', headers: { ...ORIGIN, authorization: `Bearer ${await makeToken(CLIENTE)}`, 'content-type': `multipart/form-data; boundary=${boundary}` }, payload })
  expect(res.statusCode).toBe(200)
  expect(res.json().data.transcricao).toBe('Talvez aumentar o título.')
  expect(db.feedback.create).not.toHaveBeenCalled()
})
