import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FeedbackService } from '../../src/services/feedbackService.js'

vi.mock('../../src/database/client.js', () => ({
  default: {
    feedback: {
      findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn(),
      create: vi.fn(), update: vi.fn(), delete: vi.fn(),
    },
    arte: { findUnique: vi.fn() },
    usuario: { findUnique: vi.fn() },
  },
}))

import prisma from '../../src/database/client.js'
const service = new FeedbackService()
beforeEach(() => vi.clearAllMocks())

describe('FeedbackService', () => {
  it('listFeedbacks deve retornar feedbacks paginados', async () => {
    vi.mocked(prisma.feedback.findMany).mockResolvedValue([])
    vi.mocked(prisma.feedback.count).mockResolvedValue(0)
    const result = await service.listFeedbacks({})
    expect(result).toEqual({ feedbacks: [], total: 0 })
  })

  it('createFeedback deve lançar erro se arte não existe', async () => {
    vi.mocked(prisma.arte.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue({ id: '1' } as any)
    await expect(service.createFeedback({ arteId: 'x', autorId: '1' }))
      .rejects.toThrow('Arte não encontrada')
  })

  it('createFeedback deve lançar erro se autor não existe', async () => {
    vi.mocked(prisma.arte.findUnique).mockResolvedValue({ id: '1' } as any)
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)
    await expect(service.createFeedback({ arteId: '1', autorId: 'x' }))
      .rejects.toThrow('Autor não encontrado')
  })

  it('updateFeedback deve lançar erro se não existe', async () => {
    vi.mocked(prisma.feedback.findUnique).mockResolvedValue(null)
    await expect(service.updateFeedback('x', {})).rejects.toThrow('Feedback não encontrado')
  })

  it('deleteFeedback deve lançar erro se não existe', async () => {
    vi.mocked(prisma.feedback.findUnique).mockResolvedValue(null)
    await expect(service.deleteFeedback('x')).rejects.toThrow('Feedback não encontrado')
  })
})
