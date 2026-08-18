import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConviteService } from '../../src/services/conviteService.js'

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  return { default: criarPrismaMock() }
})

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: vi.fn().mockResolvedValue({}) },
  })),
}))

vi.mock('../../src/config/env.js', () => ({
  env: {
    RESEND_API_KEY: undefined,
    FRONTEND_URL: 'http://localhost:3000',
    EMAIL_FROM: 'noreply@viu.app',
  },
}))

import prisma from '../../src/database/client.js'

const service = new ConviteService()

beforeEach(() => vi.clearAllMocks())

// ─── criarConvite ─────────────────────────────────────────────────────────────

describe('ConviteService.criarConvite', () => {
  const projetoId = 'p1'
  const convidadoId = 'u2'
  const convidadoPorId = 'u1'

  function mockProjetoOk() {
    vi.mocked(prisma.projeto.findUnique).mockResolvedValue({ nome: 'Projeto X', status: 'RASCUNHO' } as any)
  }
  function mockConvidadoOk() {
    vi.mocked(prisma.usuario.findUnique)
      .mockResolvedValueOnce({ id: convidadoId, email: 'c@test.com', ativo: true } as any)
      .mockResolvedValueOnce({ nome: 'João' } as any)
  }

  it('retorna rawToken ao criar convite válido', async () => {
    mockProjetoOk()
    mockConvidadoOk()
    vi.mocked(prisma.conviteProjeto.updateMany).mockResolvedValue({ count: 0 } as any)
    vi.mocked(prisma.conviteProjeto.create).mockResolvedValue({} as any)

    const token = await service.criarConvite(projetoId, convidadoId, convidadoPorId)
    expect(typeof token).toBe('string')
    expect(token).toHaveLength(64) // 32 bytes hex = 64 chars
  })

  it('lança erro se projeto não for RASCUNHO', async () => {
    vi.mocked(prisma.projeto.findUnique).mockResolvedValue({ nome: 'X', status: 'EM_ANDAMENTO' } as any)
    vi.mocked(prisma.usuario.findUnique)
      .mockResolvedValueOnce({ id: convidadoId, email: 'c@test.com', ativo: true } as any)
      .mockResolvedValueOnce({ nome: 'João' } as any)

    await expect(service.criarConvite(projetoId, convidadoId, convidadoPorId)).rejects.toThrow(
      'só pode ser criado para projetos em rascunho',
    )
  })

  it('lança erro se projeto não existir', async () => {
    vi.mocked(prisma.projeto.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.usuario.findUnique)
      .mockResolvedValueOnce({ id: convidadoId, email: 'c@test.com', ativo: true } as any)
      .mockResolvedValueOnce({ nome: 'João' } as any)

    await expect(service.criarConvite(projetoId, convidadoId, convidadoPorId)).rejects.toThrow(
      'Projeto não encontrado',
    )
  })

  it('lança erro se convidado estiver inativo', async () => {
    vi.mocked(prisma.projeto.findUnique).mockResolvedValue({ nome: 'X', status: 'RASCUNHO' } as any)
    vi.mocked(prisma.usuario.findUnique)
      .mockResolvedValueOnce({ id: convidadoId, email: 'c@test.com', ativo: false } as any)
      .mockResolvedValueOnce({ nome: 'João' } as any)

    await expect(service.criarConvite(projetoId, convidadoId, convidadoPorId)).rejects.toThrow('inativo')
  })

  it('cancela convite pendente anterior antes de criar', async () => {
    mockProjetoOk()
    mockConvidadoOk()
    vi.mocked(prisma.conviteProjeto.updateMany).mockResolvedValue({ count: 1 } as any)
    vi.mocked(prisma.conviteProjeto.create).mockResolvedValue({} as any)

    await service.criarConvite(projetoId, convidadoId, convidadoPorId)

    expect(prisma.conviteProjeto.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projetoId, convidadoId, status: 'PENDENTE' },
        data: expect.objectContaining({ status: 'CANCELADO' }),
      }),
    )
  })
})

// ─── aceitarConvite ───────────────────────────────────────────────────────────

describe('ConviteService.aceitarConvite', () => {
  const rawToken = 'a'.repeat(64)
  const usuarioId = 'u2'

  function mockConviteValido(overrides: Record<string, any> = {}) {
    vi.mocked(prisma.conviteProjeto.findUnique).mockResolvedValue({
      tokenHash: 'hash',
      convidadoId: usuarioId,
      projetoId: 'p1',
      status: 'PENDENTE',
      expiraEm: new Date(Date.now() + 1000 * 60 * 60),
      projeto: { id: 'p1', nome: 'X', status: 'RASCUNHO' },
      ...overrides,
    } as any)
  }

  it('aceita convite válido e move projeto para EM_ANDAMENTO', async () => {
    mockConviteValido()
    vi.mocked(prisma.$transaction).mockResolvedValue([{}, {}] as any)
    vi.mocked(prisma.projeto.findUnique).mockResolvedValue({
      id: 'p1', nome: 'X', status: 'EM_ANDAMENTO',
    } as any)

    const resultado = await service.aceitarConvite(rawToken, usuarioId)
    expect(prisma.$transaction).toHaveBeenCalled()
    expect(resultado).toMatchObject({ status: 'EM_ANDAMENTO' })
  })

  it('lança erro se convite não pertence ao usuário', async () => {
    mockConviteValido({ convidadoId: 'outro' })

    await expect(service.aceitarConvite(rawToken, usuarioId)).rejects.toThrow('não pertence a você')
  })

  it('lança erro se convite já foi respondido', async () => {
    mockConviteValido({ status: 'ACEITO' })

    await expect(service.aceitarConvite(rawToken, usuarioId)).rejects.toThrow('já foi respondido')
  })

  it('lança erro e marca como EXPIRADO se prazo passou', async () => {
    mockConviteValido({ expiraEm: new Date(Date.now() - 1000) })
    vi.mocked(prisma.conviteProjeto.update).mockResolvedValue({} as any)

    await expect(service.aceitarConvite(rawToken, usuarioId)).rejects.toThrow('expirou')
    expect(prisma.conviteProjeto.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'EXPIRADO' }) }),
    )
  })

  it('lança erro se projeto não está mais em RASCUNHO', async () => {
    mockConviteValido({ projeto: { id: 'p1', nome: 'X', status: 'CANCELADO' } })

    await expect(service.aceitarConvite(rawToken, usuarioId)).rejects.toThrow('não está mais aguardando')
  })

  it('lança erro se convite não encontrado', async () => {
    vi.mocked(prisma.conviteProjeto.findUnique).mockResolvedValue(null)

    await expect(service.aceitarConvite(rawToken, usuarioId)).rejects.toThrow('não encontrado')
  })
})

// ─── recusarConvite ───────────────────────────────────────────────────────────

describe('ConviteService.recusarConvite', () => {
  const rawToken = 'b'.repeat(64)
  const usuarioId = 'u2'

  function mockConvitePendente(overrides: Record<string, any> = {}) {
    vi.mocked(prisma.conviteProjeto.findUnique).mockResolvedValue({
      tokenHash: 'hash',
      convidadoId: usuarioId,
      projetoId: 'p1',
      status: 'PENDENTE',
      projeto: { id: 'p1', status: 'RASCUNHO' },
      ...overrides,
    } as any)
  }

  it('recusa convite e cancela projeto', async () => {
    mockConvitePendente()
    vi.mocked(prisma.$transaction).mockResolvedValue([{}, {}] as any)

    await service.recusarConvite(rawToken, usuarioId)
    expect(prisma.$transaction).toHaveBeenCalled()
  })

  it('lança erro se convite não pertence ao usuário', async () => {
    mockConvitePendente({ convidadoId: 'outro' })

    await expect(service.recusarConvite(rawToken, usuarioId)).rejects.toThrow('não pertence a você')
  })

  it('lança erro se convite já foi respondido', async () => {
    mockConvitePendente({ status: 'RECUSADO' })

    await expect(service.recusarConvite(rawToken, usuarioId)).rejects.toThrow('já foi respondido')
  })
})

// ─── listarConvitesPendentes ──────────────────────────────────────────────────

describe('ConviteService.listarConvitesPendentes', () => {
  it('marca expirados antes de listar', async () => {
    vi.mocked(prisma.conviteProjeto.updateMany).mockResolvedValue({ count: 2 } as any)
    vi.mocked(prisma.conviteProjeto.findMany).mockResolvedValue([])

    await service.listarConvitesPendentes('u1')

    expect(prisma.conviteProjeto.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'PENDENTE' }),
        data: expect.objectContaining({ status: 'EXPIRADO' }),
      }),
    )
    expect(prisma.conviteProjeto.findMany).toHaveBeenCalled()
  })
})
