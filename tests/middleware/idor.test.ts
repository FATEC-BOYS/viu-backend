/**
 * Testes de regressão para as vulnerabilidades de IDOR corrigidas.
 *
 * Coberturas:
 * 1. requireProjectAccess agora resolve projetoId a partir de IDs de feedback
 * 2. listarAceitesProjeto exige que o caller seja participant do projeto
 * 3. registrarAceite exige que o caller seja participant do projeto
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  return { default: criarPrismaMock() }
})

import prisma from '../../src/database/client.js'
import { requireProjectAccess } from '../../src/middleware/authorizationMiddleware.js'
import { listarAceitesProjeto, registrarAceite } from '../../src/controllers/aceiteController.js'

function makeReply() {
  const r: any = { statusCode: 200, body: null }
  r.status = (code: number) => { r.statusCode = code; return r }
  r.send = (data: any) => { r.body = data; return r }
  return r
}

beforeEach(() => vi.clearAllMocks())

// ─── 1. requireProjectAccess — feedback ───────────────────────────────────────

describe('requireProjectAccess com ID de feedback', () => {
  const designer = { id: 'd1', tipo: 'DESIGNER' }
  const estranho = { id: 'x1', tipo: 'CLIENTE' }

  it('resolve projetoId a partir do feedback e concede acesso ao designer', async () => {
    vi.mocked(prisma.arte.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.tarefa.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.feedback.findUnique).mockResolvedValue({
      arte: { projetoId: 'proj1', projeto: { designerId: 'd1', clienteId: 'c1' } },
    } as any)

    const req: any = { usuario: designer, params: { id: 'fb1' }, body: {}, audioData: null }
    const reply = makeReply()
    await requireProjectAccess(req, reply)

    expect(reply.statusCode).toBe(200)
    expect(req.projetoId).toBe('proj1')
    expect(vi.mocked(prisma.feedback.findUnique)).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'fb1' } }),
    )
  })

  it('retorna 403 quando caller não é participant do projeto do feedback', async () => {
    vi.mocked(prisma.arte.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.tarefa.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.feedback.findUnique).mockResolvedValue({
      arte: { projetoId: 'proj1', projeto: { designerId: 'd1', clienteId: 'c1' } },
    } as any)

    const req: any = { usuario: estranho, params: { id: 'fb1' }, body: {}, audioData: null }
    const reply = makeReply()
    await requireProjectAccess(req, reply)

    expect(reply.statusCode).toBe(403)
  })

  it('retorna 404 quando nenhum recurso casa com o ID', async () => {
    vi.mocked(prisma.arte.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.tarefa.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.feedback.findUnique).mockResolvedValue(null)

    const req: any = { usuario: designer, params: { id: 'inexistente' }, body: {}, audioData: null }
    const reply = makeReply()
    await requireProjectAccess(req, reply)

    // Antes respondia 400 "ID do projeto não fornecido", que descrevia mal o
    // caso: o id foi fornecido, só não existe recurso com ele. E o 400 vinha
    // de cair no corpo — o caminho que abria o IDOR.
    expect(reply.statusCode).toBe(404)
  })

  it('ignora body.projetoId quando params.id endereça um recurso', async () => {
    // O vetor do IDOR: corpo aponta para projeto próprio, params.id para uma
    // arte de terceiro. Vence o recurso endereçado.
    vi.mocked(prisma.arte.findUnique).mockResolvedValue({
      projetoId: 'proj-alheio', projeto: { designerId: 'outro', clienteId: 'outro2' },
    } as any)

    const req: any = {
      usuario: designer,
      params: { id: 'arte-alheia' },
      body: { projetoId: 'proj-do-designer' },
      audioData: null,
    }
    const reply = makeReply()
    await requireProjectAccess(req, reply)

    expect(reply.statusCode).toBe(403)
    expect(prisma.projeto.findUnique).not.toHaveBeenCalled()
  })

  it('body.arteId tem precedência sobre body.projetoId na criação', async () => {
    vi.mocked(prisma.arte.findUnique).mockResolvedValue({
      projetoId: 'proj-alheio', projeto: { designerId: 'outro', clienteId: 'outro2' },
    } as any)

    const req: any = {
      usuario: designer,
      params: {},
      body: { arteId: 'arte-alheia', projetoId: 'proj-do-designer' },
      audioData: null,
    }
    const reply = makeReply()
    await requireProjectAccess(req, reply)

    expect(reply.statusCode).toBe(403)
    expect(prisma.projeto.findUnique).not.toHaveBeenCalled()
  })

  it('body.projetoId ainda vale quando a rota não endereça recurso', async () => {
    vi.mocked(prisma.projeto.findUnique).mockResolvedValue({
      designerId: 'd1', clienteId: 'c1',
    } as any)

    const req: any = {
      usuario: designer,
      params: {},
      body: { projetoId: 'proj1' },
      audioData: null,
    }
    const reply = makeReply()
    await requireProjectAccess(req, reply)

    expect(reply.statusCode).toBe(200)
    expect(req.projetoId).toBe('proj1')
  })

  it('ADMIN bypassa a verificação mesmo sem feedback no banco', async () => {
    const req: any = { usuario: { id: 'admin1', tipo: 'ADMIN' }, params: { id: 'fb1' }, body: {}, audioData: null }
    const reply = makeReply()
    await requireProjectAccess(req, reply)

    expect(reply.statusCode).toBe(200)
    expect(prisma.feedback.findUnique).not.toHaveBeenCalled()
  })
})

// ─── 2. listarAceitesProjeto — IDOR ───────────────────────────────────────────

describe('listarAceitesProjeto — controle de acesso', () => {
  it('retorna 403 para usuário que não é participant do projeto', async () => {
    vi.mocked(prisma.projeto.findUnique).mockResolvedValue({
      designerId: 'd1', clienteId: 'c1',
    } as any)

    const req: any = { usuario: { id: 'estranho', tipo: 'DESIGNER' }, params: { projetoId: 'p1' } }
    const reply = makeReply()
    await listarAceitesProjeto(req, reply)

    expect(reply.statusCode).toBe(403)
    expect(prisma.aceiteContratual.findMany).not.toHaveBeenCalled()
  })

  it('retorna 404 quando projeto não existe', async () => {
    vi.mocked(prisma.projeto.findUnique).mockResolvedValue(null)

    const req: any = { usuario: { id: 'u1', tipo: 'CLIENTE' }, params: { projetoId: 'fantasma' } }
    const reply = makeReply()
    await listarAceitesProjeto(req, reply)

    expect(reply.statusCode).toBe(404)
    expect(prisma.aceiteContratual.findMany).not.toHaveBeenCalled()
  })

  it('retorna aceites para o designer do projeto', async () => {
    vi.mocked(prisma.projeto.findUnique).mockResolvedValue({
      designerId: 'd1', clienteId: 'c1',
    } as any)
    vi.mocked(prisma.aceiteContratual.findMany).mockResolvedValue([{ id: 'ac1' }] as any)

    const req: any = { usuario: { id: 'd1', tipo: 'DESIGNER' }, params: { projetoId: 'p1' } }
    const reply = makeReply()
    await listarAceitesProjeto(req, reply)

    expect(reply.statusCode).toBe(200)
    expect(reply.body.data).toHaveLength(1)
  })

  it('ADMIN vê aceites sem estar vinculado ao projeto', async () => {
    vi.mocked(prisma.aceiteContratual.findMany).mockResolvedValue([{ id: 'ac1' }] as any)

    const req: any = { usuario: { id: 'admin', tipo: 'ADMIN' }, params: { projetoId: 'p1' } }
    const reply = makeReply()
    await listarAceitesProjeto(req, reply)

    expect(reply.statusCode).toBe(200)
    expect(prisma.projeto.findUnique).not.toHaveBeenCalled()
  })
})

// ─── 3. registrarAceite — criação não autorizada ──────────────────────────────

describe('registrarAceite — controle de acesso', () => {
  it('retorna 403 quando caller não é participant do projeto', async () => {
    vi.mocked(prisma.projeto.findUnique).mockResolvedValue({
      designerId: 'd1', clienteId: 'c1',
    } as any)

    const req: any = {
      usuario: { id: 'invasor', tipo: 'CLIENTE' },
      body: { projetoId: 'p1' },
      ip: '1.2.3.4',
      headers: { 'user-agent': 'test' },
    }
    const reply = makeReply()
    await registrarAceite(req, reply)

    expect(reply.statusCode).toBe(403)
    expect(prisma.aceiteContratual.upsert).not.toHaveBeenCalled()
  })

  it('retorna 404 quando projeto não existe', async () => {
    vi.mocked(prisma.projeto.findUnique).mockResolvedValue(null)

    const req: any = {
      usuario: { id: 'u1', tipo: 'CLIENTE' },
      body: { projetoId: 'fantasma' },
      ip: '1.2.3.4',
      headers: { 'user-agent': 'test' },
    }
    const reply = makeReply()
    await registrarAceite(req, reply)

    expect(reply.statusCode).toBe(404)
    expect(prisma.aceiteContratual.upsert).not.toHaveBeenCalled()
  })

  it('cliente do projeto consegue registrar aceite', async () => {
    vi.mocked(prisma.projeto.findUnique).mockResolvedValue({
      designerId: 'd1', clienteId: 'c1',
    } as any)
    vi.mocked(prisma.aceiteContratual.upsert).mockResolvedValue({ id: 'ac1' } as any)

    const req: any = {
      usuario: { id: 'c1', tipo: 'CLIENTE' },
      body: { projetoId: 'p1', termoVersao: '1.0' },
      ip: '1.2.3.4',
      headers: { 'user-agent': 'test' },
    }
    const reply = makeReply()
    await registrarAceite(req, reply)

    expect(reply.statusCode).toBe(201)
    expect(prisma.aceiteContratual.upsert).toHaveBeenCalled()
  })

  it('ADMIN registra aceite independente de participação', async () => {
    vi.mocked(prisma.aceiteContratual.upsert).mockResolvedValue({ id: 'ac1' } as any)

    const req: any = {
      usuario: { id: 'admin', tipo: 'ADMIN' },
      body: { projetoId: 'p1' },
      ip: '1.2.3.4',
      headers: { 'user-agent': 'test' },
    }
    const reply = makeReply()
    await registrarAceite(req, reply)

    expect(reply.statusCode).toBe(201)
    expect(prisma.projeto.findUnique).not.toHaveBeenCalled()
  })
})
