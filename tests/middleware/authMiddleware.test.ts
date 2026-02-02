import { describe, it, expect, vi, beforeEach } from 'vitest'
import { authenticate } from '../../src/middleware/authMiddleware.js'

vi.mock('../../src/database/client.js', () => ({
  default: {
    sessao: { findUnique: vi.fn() },
  },
}))

import prisma from '../../src/database/client.js'

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
    expect(reply.body.message).toContain('Token de autenticação não fornecido')
  })

  it('deve retornar 401 se header não começa com Bearer', async () => {
    const req = createMockRequest({ authorization: 'Basic abc' })
    const reply = createMockReply()
    await authenticate(req, reply)
    expect(reply.statusCode).toBe(401)
  })

  it('deve retornar 401 se sessão não encontrada', async () => {
    vi.mocked(prisma.sessao.findUnique).mockResolvedValue(null)
    const req = createMockRequest({ authorization: 'Bearer validtoken' })
    const reply = createMockReply()
    await authenticate(req, reply)
    expect(reply.statusCode).toBe(401)
    expect(reply.body.message).toContain('Sessão inválida ou expirada')
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
    const usuario = { id: '1', nome: 'Test' }
    vi.mocked(prisma.sessao.findUnique).mockResolvedValue({
      token: 'valid', ativo: true, expiresAt: new Date(Date.now() + 100000),
      usuario,
    } as any)
    const req = createMockRequest({ authorization: 'Bearer valid' })
    const reply = createMockReply()
    await authenticate(req, reply)
    expect(req.usuario).toEqual(usuario)
    expect(reply.statusCode).toBe(200)
  })

  it('deve retornar 500 em caso de erro inesperado', async () => {
    vi.mocked(prisma.sessao.findUnique).mockRejectedValue(new Error('DB error'))
    const req = createMockRequest({ authorization: 'Bearer x' })
    const reply = createMockReply()
    await authenticate(req, reply)
    expect(reply.statusCode).toBe(500)
    expect(reply.body.message).toContain('Erro na autenticação')
  })
})
