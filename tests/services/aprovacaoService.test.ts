import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AprovacaoService } from '../../src/services/aprovacaoService.js'

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  return { default: criarPrismaMock() }
})

import prisma from '../../src/database/client.js'
const service = new AprovacaoService()
beforeEach(() => vi.clearAllMocks())

describe('AprovacaoService', () => {
  it('listAprovacoes deve retornar paginado', async () => {
    vi.mocked(prisma.aprovacao.findMany).mockResolvedValue([])
    vi.mocked(prisma.aprovacao.count).mockResolvedValue(0)
    const result = await service.listAprovacoes({})
    expect(result).toEqual({ aprovacoes: [], total: 0 })
  })

  it('createAprovacao deve lançar erro se arte não existe', async () => {
    vi.mocked(prisma.arte.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue({ id: '1' } as any)
    await expect(service.createAprovacao({ arteId: 'x', aprovadorId: '1' }))
      .rejects.toThrow('Arte não encontrada')
  })

  it('createAprovacao deve recusar quem não é o cliente do projeto', async () => {
    // A regra deixou de ser "o aprovador existe": só o cliente do projeto pode
    // aprovar, e o autor nunca aprova a própria arte.
    vi.mocked(prisma.arte.findUnique).mockResolvedValue({
      id: '1', autorId: 'd1', projeto: { clienteId: 'c1', designerId: 'd1' },
    } as any)
    await expect(service.createAprovacao({ arteId: '1', aprovadorId: 'estranho' }))
      .rejects.toThrow('Apenas o cliente do projeto pode aprovar ou rejeitar artes')
  })

  it('updateAprovacao deve lançar erro se não existe', async () => {
    vi.mocked(prisma.aprovacao.findUnique).mockResolvedValue(null)
    await expect(service.updateAprovacao('x', {})).rejects.toThrow('Aprovação não encontrada')
  })

  it('deleteAprovacao deve lançar erro se não existe', async () => {
    vi.mocked(prisma.aprovacao.findUnique).mockResolvedValue(null)
    await expect(service.deleteAprovacao('x')).rejects.toThrow('Aprovação não encontrada')
  })
})
