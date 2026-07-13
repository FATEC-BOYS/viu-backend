import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/database/client.js', () => ({
  default: {
    arte: { findUnique: vi.fn() },
    whatsAppEnvio: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  },
}))

vi.mock('../../src/services/whatsappService.js', () => ({
  isWhatsAppConfigured: vi.fn().mockReturnValue(true),
  enviarSolicitacaoAprovacao: vi.fn().mockResolvedValue('wamid.OUT'),
}))

import prisma from '../../src/database/client.js'
import { enviarSolicitacaoAprovacao } from '../../src/services/whatsappService.js'
import {
  criarEnvioAprovacao,
  normalizarTelefone,
  WhatsAppEnvioError,
} from '../../src/services/whatsappEnvioService.js'

beforeEach(() => vi.clearAllMocks())

const ARTE = {
  id: 'arte1',
  nome: 'Post',
  versao: 2,
  projeto: {
    designerId: 'des1',
    cliente: { id: 'cli1', nome: 'Cliente', telefone: '(11) 99999-9999' },
  },
}

describe('normalizarTelefone', () => {
  it('converte formato BR para E.164 sem "+"', () => {
    expect(normalizarTelefone('(11) 99999-9999')).toBe('5511999999999')
    expect(normalizarTelefone('11 3333-4444')).toBe('551133334444')
    expect(normalizarTelefone('+55 11 99999-9999')).toBe('5511999999999')
  })

  it('rejeita telefone incompleto', () => {
    expect(normalizarTelefone('9999')).toBeNull()
  })
})

describe('criarEnvioAprovacao', () => {
  it('cria envio, dispara card e persiste o wamid', async () => {
    vi.mocked(prisma.arte.findUnique).mockResolvedValue(ARTE as any)
    vi.mocked(prisma.whatsAppEnvio.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.whatsAppEnvio.create).mockResolvedValue({ id: 'env1' } as any)
    vi.mocked(prisma.whatsAppEnvio.update).mockResolvedValue({ id: 'env1', waMessageId: 'wamid.OUT' } as any)

    const envio = await criarEnvioAprovacao('des1', 'DESIGNER', 'arte1')

    expect(enviarSolicitacaoAprovacao).toHaveBeenCalledWith('5511999999999', expect.objectContaining({ envioId: 'env1' }))
    expect(envio.waMessageId).toBe('wamid.OUT')
  })

  it('rejeita quem não é o designer do projeto', async () => {
    vi.mocked(prisma.arte.findUnique).mockResolvedValue(ARTE as any)

    await expect(criarEnvioAprovacao('outro', 'DESIGNER', 'arte1')).rejects.toMatchObject({ statusCode: 403 })
    expect(prisma.whatsAppEnvio.create).not.toHaveBeenCalled()
  })

  it('rejeita cliente sem telefone cadastrado', async () => {
    vi.mocked(prisma.arte.findUnique).mockResolvedValue({
      ...ARTE,
      projeto: { ...ARTE.projeto, cliente: { ...ARTE.projeto.cliente, telefone: null } },
    } as any)

    await expect(criarEnvioAprovacao('des1', 'DESIGNER', 'arte1')).rejects.toMatchObject({ statusCode: 422 })
  })

  it('impede segunda solicitação ativa para a mesma arte', async () => {
    vi.mocked(prisma.arte.findUnique).mockResolvedValue(ARTE as any)
    vi.mocked(prisma.whatsAppEnvio.findFirst).mockResolvedValue({ id: 'envAtivo' } as any)

    await expect(criarEnvioAprovacao('des1', 'DESIGNER', 'arte1')).rejects.toMatchObject({ statusCode: 409 })
  })

  it('marca envio como FALHOU se a Meta recusar o envio', async () => {
    vi.mocked(prisma.arte.findUnique).mockResolvedValue(ARTE as any)
    vi.mocked(prisma.whatsAppEnvio.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.whatsAppEnvio.create).mockResolvedValue({ id: 'env1' } as any)
    vi.mocked(enviarSolicitacaoAprovacao).mockRejectedValue(new Error('template not approved'))

    await expect(criarEnvioAprovacao('des1', 'DESIGNER', 'arte1')).rejects.toBeInstanceOf(WhatsAppEnvioError)
    expect(prisma.whatsAppEnvio.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FALHOU' }) }),
    )
  })
})
