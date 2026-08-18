import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AprovacaoService } from '../../src/services/aprovacaoService.js'

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  return { default: criarPrismaMock() }
})

import prisma from '../../src/database/client.js'

const service = new AprovacaoService()

beforeEach(() => vi.clearAllMocks())

describe('AprovacaoService soft delete', () => {
  it('soft delete: marca deletedAt em vez de deletar fisicamente', async () => {
    ;(prisma.aprovacao.findUnique as any).mockResolvedValue({
      id: 'a1',
      aprovadorId: 'u1',
      status: 'PENDENTE',
      deletedAt: null,
    })
    ;(prisma.aprovacao.update as any).mockResolvedValue({})

    await service.deleteAprovacao('a1', 'u1', false)

    expect(prisma.aprovacao.update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: { deletedAt: expect.any(Date) },
    })
  })

  it('não deleta fisicamente — prisma.aprovacao.delete nunca chamado', async () => {
    ;(prisma.aprovacao.findUnique as any).mockResolvedValue({
      id: 'a1',
      aprovadorId: 'u1',
      deletedAt: null,
    })
    ;(prisma.aprovacao.update as any).mockResolvedValue({})

    await service.deleteAprovacao('a1', 'u1', false)

    expect((prisma.aprovacao as any).delete).not.toHaveBeenCalled()
  })

  it('rejeita se aprovação não encontrada (já soft-deletada ou inexistente)', async () => {
    ;(prisma.aprovacao.findUnique as any).mockResolvedValue(null)
    await expect(service.deleteAprovacao('a1', 'u1', false)).rejects.toThrow('Aprovação não encontrada')
  })

  it('rejeita se usuário não é o aprovador nem admin', async () => {
    ;(prisma.aprovacao.findUnique as any).mockResolvedValue({
      id: 'a1',
      aprovadorId: 'outroUsuario',
      deletedAt: null,
    })
    await expect(service.deleteAprovacao('a1', 'u1', false)).rejects.toThrow('Acesso negado')
  })

  it('admin pode deletar aprovação de outro usuário', async () => {
    ;(prisma.aprovacao.findUnique as any).mockResolvedValue({
      id: 'a1',
      aprovadorId: 'outroUsuario',
      deletedAt: null,
    })
    ;(prisma.aprovacao.update as any).mockResolvedValue({})

    await service.deleteAprovacao('a1', 'adminId', true)
    expect(prisma.aprovacao.update).toHaveBeenCalled()
  })

  it('listAprovacoes filtra deletedAt: null', async () => {
    ;(prisma.aprovacao.findMany as any).mockResolvedValue([])
    ;(prisma.aprovacao.count as any).mockResolvedValue(0)

    await service.listAprovacoes({})

    expect(prisma.aprovacao.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ deletedAt: null }) }),
    )
  })
})
