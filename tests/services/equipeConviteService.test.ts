import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EquipeConviteService } from '../../src/services/equipeConviteService.js'

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

vi.mock('../../src/services/equipeService.js', () => ({
  adicionarMembro: vi.fn(),
}))

import prisma from '../../src/database/client.js'

const service = new EquipeConviteService()

beforeEach(() => vi.clearAllMocks())

// ─── criarConvite ─────────────────────────────────────────────────────────────

describe('EquipeConviteService.criarConvite', () => {
  const equipeId = 'e1'
  const convidadoId = 'u2'
  const papel = 'DESIGNER'
  const convidadoPorId = 'u1'

  it('cria convite quando líder convida usuário válido', async () => {
    ;(prisma.equipe.findUnique as any).mockResolvedValue({ id: equipeId, nome: 'Equipe Alpha' })
    ;(prisma.usuario.findUnique as any)
      .mockResolvedValueOnce({ id: convidadoId, email: 'u2@test.com', ativo: true })
      .mockResolvedValueOnce({ id: convidadoPorId, nome: 'Líder' })
    ;(prisma.equipeMembro.findUnique as any)
      .mockResolvedValueOnce({ papel: 'LIDER' }) // solicitante é líder
      .mockResolvedValueOnce(null) // convidado não é membro
    ;(prisma.equipeConvite.updateMany as any).mockResolvedValue({ count: 0 })
    ;(prisma.equipeConvite.create as any).mockResolvedValue({})

    const rawToken = await service.criarConvite(equipeId, convidadoId, papel, convidadoPorId, false)
    expect(rawToken).toHaveLength(64)
    expect(prisma.equipeConvite.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ equipeId, convidadoId, papel }) }),
    )
  })

  it('admin pode convidar sem ser membro', async () => {
    ;(prisma.equipe.findUnique as any).mockResolvedValue({ id: equipeId, nome: 'Equipe Beta' })
    ;(prisma.usuario.findUnique as any)
      .mockResolvedValueOnce({ id: convidadoId, email: 'u2@test.com', ativo: true })
      .mockResolvedValueOnce({ id: convidadoPorId, nome: 'Admin' })
    ;(prisma.equipeMembro.findUnique as any).mockResolvedValue(null) // não é membro
    ;(prisma.equipeConvite.updateMany as any).mockResolvedValue({ count: 0 })
    ;(prisma.equipeConvite.create as any).mockResolvedValue({})

    const rawToken = await service.criarConvite(equipeId, convidadoId, papel, convidadoPorId, true)
    expect(rawToken).toHaveLength(64)
  })

  it('rejeita se solicitante não é líder', async () => {
    ;(prisma.equipe.findUnique as any).mockResolvedValue({ id: equipeId, nome: 'Equipe' })
    ;(prisma.usuario.findUnique as any)
      .mockResolvedValueOnce({ id: convidadoId, email: 'u2@test.com', ativo: true })
      .mockResolvedValueOnce({ id: convidadoPorId, nome: 'Membro' })
    ;(prisma.equipeMembro.findUnique as any).mockResolvedValue({ papel: 'DESIGNER' }) // não é líder

    await expect(service.criarConvite(equipeId, convidadoId, papel, convidadoPorId, false)).rejects.toThrow(
      'Apenas líderes',
    )
  })

  it('rejeita papel inválido', async () => {
    await expect(service.criarConvite(equipeId, convidadoId, 'INVALIDO', convidadoPorId, true)).rejects.toThrow(
      'Papel inválido',
    )
  })

  it('rejeita se equipe não existe', async () => {
    ;(prisma.equipe.findUnique as any).mockResolvedValue(null)
    ;(prisma.usuario.findUnique as any)
      .mockResolvedValueOnce({ id: convidadoId, email: 'u2@test.com', ativo: true })
      .mockResolvedValueOnce({ id: convidadoPorId, nome: 'Admin' })

    await expect(service.criarConvite(equipeId, convidadoId, papel, convidadoPorId, true)).rejects.toThrow(
      'Equipe não encontrada',
    )
  })

  it('rejeita se convidado já é membro', async () => {
    ;(prisma.equipe.findUnique as any).mockResolvedValue({ id: equipeId, nome: 'Equipe' })
    ;(prisma.usuario.findUnique as any)
      .mockResolvedValueOnce({ id: convidadoId, email: 'u2@test.com', ativo: true })
      .mockResolvedValueOnce({ id: convidadoPorId, nome: 'Admin' })
    ;(prisma.equipeMembro.findUnique as any).mockResolvedValue({ papel: 'DESIGNER' }) // já é membro

    await expect(service.criarConvite(equipeId, convidadoId, papel, convidadoPorId, true)).rejects.toThrow(
      'já é membro',
    )
  })
})

// ─── aceitarConvite ───────────────────────────────────────────────────────────

describe('EquipeConviteService.aceitarConvite', () => {
  const usuarioId = 'u2'
  const equipeId = 'e1'
  const conviteMock = {
    tokenHash: 'hash',
    status: 'PENDENTE',
    convidadoId: usuarioId,
    equipeId,
    papel: 'DESIGNER',
    expiraEm: new Date(Date.now() + 86400000),
    equipe: { id: equipeId, nome: 'Equipe Alpha' },
  }

  it('aceita convite válido e adiciona membro', async () => {
    ;(prisma.equipeConvite.findUnique as any).mockResolvedValue(conviteMock)
    ;(prisma.equipeMembro.findUnique as any).mockResolvedValue(null)
    ;(prisma.$transaction as any).mockResolvedValue([{}, {}])
    ;(prisma.equipe.findUnique as any).mockResolvedValue({ id: equipeId, nome: 'Equipe Alpha', slug: 'alpha' })

    const result = await service.aceitarConvite('rawtoken', usuarioId)
    expect(prisma.$transaction).toHaveBeenCalled()
    expect(result).toMatchObject({ id: equipeId })
  })

  it('rejeita se convite não pertence ao usuário', async () => {
    ;(prisma.equipeConvite.findUnique as any).mockResolvedValue({ ...conviteMock, convidadoId: 'outro' })
    await expect(service.aceitarConvite('rawtoken', usuarioId)).rejects.toThrow('não pertence')
  })

  it('rejeita se convite já foi respondido', async () => {
    ;(prisma.equipeConvite.findUnique as any).mockResolvedValue({ ...conviteMock, status: 'ACEITO' })
    await expect(service.aceitarConvite('rawtoken', usuarioId)).rejects.toThrow('já foi respondido')
  })

  it('rejeita se convite expirou', async () => {
    ;(prisma.equipeConvite.findUnique as any).mockResolvedValue({
      ...conviteMock,
      expiraEm: new Date(Date.now() - 1000),
    })
    ;(prisma.equipeConvite.update as any).mockResolvedValue({})
    await expect(service.aceitarConvite('rawtoken', usuarioId)).rejects.toThrow('expirou')
  })
})

// ─── recusarConvite ───────────────────────────────────────────────────────────

describe('EquipeConviteService.recusarConvite', () => {
  const usuarioId = 'u2'
  const conviteMock = {
    tokenHash: 'hash',
    status: 'PENDENTE',
    convidadoId: usuarioId,
    equipeId: 'e1',
    papel: 'DESIGNER',
    expiraEm: new Date(Date.now() + 86400000),
  }

  it('recusa convite válido', async () => {
    ;(prisma.equipeConvite.findUnique as any).mockResolvedValue(conviteMock)
    ;(prisma.equipeConvite.update as any).mockResolvedValue({})

    await service.recusarConvite('rawtoken', usuarioId)
    expect(prisma.equipeConvite.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'RECUSADO' }) }),
    )
  })

  it('rejeita se convite já respondido', async () => {
    ;(prisma.equipeConvite.findUnique as any).mockResolvedValue({ ...conviteMock, status: 'RECUSADO' })
    await expect(service.recusarConvite('rawtoken', usuarioId)).rejects.toThrow('já foi respondido')
  })
})
