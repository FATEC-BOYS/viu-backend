import { describe, it, expect, vi, beforeEach } from 'vitest'
import { authenticate } from '../../src/middleware/authMiddleware.js'

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  return { default: criarPrismaMock() }
})

import prisma from '../../src/database/client.js'
import { makeToken, DESIGNER, CLIENTE } from '../helpers/token.js'

function createMockRequest(headers: Record<string, string> = {}) {
  return { headers } as any
}

function createMockReply() {
  const reply: any = {
    statusCode: 200,
    body: null,
    status(code: number) { reply.statusCode = code; return reply },
    send(data: any) { reply.body = data; return reply },
  }
  return reply
}

beforeEach(() => vi.clearAllMocks())

describe('authenticate middleware', () => {
  it('deve retornar 401 se não há header Authorization', async () => {
    const req = createMockRequest()
    const reply = createMockReply()
    await authenticate(req, reply)
    expect(reply.statusCode).toBe(401)
    expect(reply.body.message).toContain('Token não fornecido')
  })

  it('deve retornar 401 se header não começa com Bearer', async () => {
    const req = createMockRequest({ authorization: 'Basic abc' })
    const reply = createMockReply()
    await authenticate(req, reply)
    expect(reply.statusCode).toBe(401)
  })

  it('deve retornar 401 se sessão não encontrada', async () => {
    vi.mocked(prisma.sessao.findFirst).mockResolvedValue(null)
    const req = createMockRequest({ authorization: 'Bearer validtoken' })
    const reply = createMockReply()
    await authenticate(req, reply)
    expect(reply.statusCode).toBe(401)
    expect(reply.body.message).toContain('Token inválido ou expirado')
  })

  it('deve retornar 401 se sessão inativa', async () => {
    vi.mocked(prisma.sessao.findUnique).mockResolvedValue({
      token: 'x', ativo: false, expiresAt: new Date(Date.now() + 100000),
      usuario: { id: '1' },
    } as any)
    const req = createMockRequest({ authorization: 'Bearer x' })
    const reply = createMockReply()
    await authenticate(req, reply)
    expect(reply.statusCode).toBe(401)
  })

  it('deve retornar 401 se sessão expirada', async () => {
    vi.mocked(prisma.sessao.findUnique).mockResolvedValue({
      token: 'x', ativo: true, expiresAt: new Date(Date.now() - 100000),
      usuario: { id: '1' },
    } as any)
    const req = createMockRequest({ authorization: 'Bearer x' })
    const reply = createMockReply()
    await authenticate(req, reply)
    expect(reply.statusCode).toBe(401)
  })

  it('deve anexar usuário à request se sessão válida', async () => {
    // O middleware valida o JWT e monta request.usuario a partir do payload;
    // a sessão só serve para permitir revogação.
    vi.mocked(prisma.sessao.findFirst).mockResolvedValue({ id: 'csessao1' } as any)
    const req = createMockRequest({ authorization: `Bearer ${await makeToken(DESIGNER)}` })
    const reply = createMockReply()
    await authenticate(req, reply)
    expect(req.usuario).toMatchObject({
      id: DESIGNER.id,
      email: DESIGNER.email,
      nome: DESIGNER.nome,
      tipo: DESIGNER.tipo,
    })
    expect(reply.statusCode).toBe(200)
  })

  it('deve retornar 500 em caso de erro inesperado', async () => {
    vi.mocked(prisma.sessao.findFirst).mockRejectedValue(new Error('DB error'))
    const req = createMockRequest({ authorization: `Bearer ${await makeToken(DESIGNER)}` })
    const reply = createMockReply()
    await authenticate(req, reply)
    expect(reply.statusCode).toBe(500)
    expect(reply.body.message).toContain('Erro na autenticação')
  })
})

// ─── sessão por cookie ────────────────────────────────────────────────────────

function requestComCookie(
  cookies: Record<string, string>,
  extras: { method?: string; headers?: Record<string, string> } = {},
) {
  return {
    headers: extras.headers ?? {},
    cookies,
    method: extras.method ?? 'GET',
  } as any
}

describe('authenticate — cookie HttpOnly', () => {
  it('aceita o token vindo do cookie quando não há header', async () => {
    vi.mocked(prisma.sessao.findFirst).mockResolvedValue({ id: 'csessao1' } as any)
    const req = requestComCookie({ viu_token: await makeToken(DESIGNER) })
    const reply = createMockReply()

    await authenticate(req, reply)

    expect(req.usuario).toMatchObject({ id: DESIGNER.id })
    expect(reply.statusCode).toBe(200)
  })

  it('o header tem precedência sobre o cookie', async () => {
    vi.mocked(prisma.sessao.findFirst).mockResolvedValue({ id: 'csessao1' } as any)
    const req = requestComCookie(
      { viu_token: await makeToken(CLIENTE) },
      { headers: { authorization: `Bearer ${await makeToken(DESIGNER)}` } },
    )
    const reply = createMockReply()

    await authenticate(req, reply)

    expect(req.usuario).toMatchObject({ id: DESIGNER.id })
  })

  it('recusa escrita autenticada por cookie sem Origin — é o vetor de CSRF', async () => {
    vi.mocked(prisma.sessao.findFirst).mockResolvedValue({ id: 'csessao1' } as any)
    const req = requestComCookie({ viu_token: await makeToken(DESIGNER) }, { method: 'POST' })
    const reply = createMockReply()

    await authenticate(req, reply)

    expect(reply.statusCode).toBe(403)
    expect(reply.body.message).toContain('Origem não autorizada')
  })

  it('recusa escrita por cookie vinda de origem desconhecida', async () => {
    vi.mocked(prisma.sessao.findFirst).mockResolvedValue({ id: 'csessao1' } as any)
    const req = requestComCookie(
      { viu_token: await makeToken(DESIGNER) },
      { method: 'POST', headers: { origin: 'https://site-malicioso.example' } },
    )
    const reply = createMockReply()

    await authenticate(req, reply)

    expect(reply.statusCode).toBe(403)
  })

  it('aceita escrita por cookie a partir de uma origem permitida', async () => {
    vi.mocked(prisma.sessao.findFirst).mockResolvedValue({ id: 'csessao1' } as any)
    const req = requestComCookie(
      { viu_token: await makeToken(DESIGNER) },
      { method: 'POST', headers: { origin: 'http://localhost:3000' } },
    )
    const reply = createMockReply()

    await authenticate(req, reply)

    expect(reply.statusCode).toBe(200)
    expect(req.usuario).toMatchObject({ id: DESIGNER.id })
  })

  it('escrita com Bearer não exige Origin — cliente fora do navegador', async () => {
    vi.mocked(prisma.sessao.findFirst).mockResolvedValue({ id: 'csessao1' } as any)
    const req = {
      headers: { authorization: `Bearer ${await makeToken(DESIGNER)}` },
      method: 'POST',
      cookies: {},
    } as any
    const reply = createMockReply()

    await authenticate(req, reply)

    expect(reply.statusCode).toBe(200)
  })
})
