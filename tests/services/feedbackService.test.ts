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

vi.mock('../../src/supabaseAdmin.js', () => ({
  supa: {
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://storage.test/audio.webm' } }),
      }),
    },
  },
}))

vi.mock('../../src/services/transcricaoService.js', () => ({
  transcreverAudio: vi.fn().mockResolvedValue('texto transcrito do áudio'),
  sintetizarTexto: vi.fn().mockResolvedValue(Buffer.from([1, 2, 3])),
}))

import prisma from '../../src/database/client.js'
import { transcreverAudio, sintetizarTexto } from '../../src/services/transcricaoService.js'

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

describe('FeedbackService - createFeedbackComAudio', () => {
  it('deve lançar erro se arte não existe', async () => {
    vi.mocked(prisma.arte.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue({ id: '1' } as any)
    await expect(service.createFeedbackComAudio({
      arteId: 'x', autorId: '1', audioBuffer: Buffer.from('a'), filename: 'a.webm',
    })).rejects.toThrow('Arte não encontrada')
  })

  it('deve lançar erro se autor não existe', async () => {
    vi.mocked(prisma.arte.findUnique).mockResolvedValue({ id: '1' } as any)
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)
    await expect(service.createFeedbackComAudio({
      arteId: '1', autorId: 'x', audioBuffer: Buffer.from('a'), filename: 'a.webm',
    })).rejects.toThrow('Autor não encontrado')
  })

  it('deve criar feedback POSICIONAL com áudio e transcrição', async () => {
    vi.mocked(prisma.arte.findUnique).mockResolvedValue({ id: 'art1' } as any)
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue({ id: 'usr1' } as any)
    vi.mocked(prisma.feedback.create).mockResolvedValue({ id: 'fb1', tipo: 'POSICIONAL' } as any)

    const result = await service.createFeedbackComAudio({
      arteId: 'art1', autorId: 'usr1',
      audioBuffer: Buffer.from('audio'), filename: 'audio.webm',
      posicaoX: 150, posicaoY: 200,
    })

    expect(transcreverAudio).toHaveBeenCalledWith(Buffer.from('audio'), 'audio.webm')
    expect(prisma.feedback.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        tipo: 'POSICIONAL',
        conteudo: 'texto transcrito do áudio',
        transcricao: 'texto transcrito do áudio',
        posicaoX: 150,
        posicaoY: 200,
        arquivo: 'https://storage.test/audio.webm',
      }),
    }))
    expect(result.tipo).toBe('POSICIONAL')
  })

  it('deve criar feedback AUDIO se sem coordenadas', async () => {
    vi.mocked(prisma.arte.findUnique).mockResolvedValue({ id: 'art1' } as any)
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue({ id: 'usr1' } as any)
    vi.mocked(prisma.feedback.create).mockResolvedValue({ id: 'fb1', tipo: 'AUDIO' } as any)

    await service.createFeedbackComAudio({
      arteId: 'art1', autorId: 'usr1',
      audioBuffer: Buffer.from('audio'), filename: 'audio.webm',
    })

    expect(prisma.feedback.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tipo: 'AUDIO' }),
    }))
  })
})

describe('FeedbackService - gerarAudioDoFeedback', () => {
  it('deve lançar erro se feedback não existe', async () => {
    vi.mocked(prisma.feedback.findUnique).mockResolvedValue(null)
    await expect(service.gerarAudioDoFeedback('x')).rejects.toThrow('Feedback não encontrado')
  })

  it('deve lançar erro se conteúdo vazio', async () => {
    vi.mocked(prisma.feedback.findUnique).mockResolvedValue({
      id: '1', conteudo: '', audioGerado: null,
    } as any)
    await expect(service.gerarAudioDoFeedback('1'))
      .rejects.toThrow('não possui conteúdo textual')
  })

  it('deve gerar áudio TTS e retornar buffer', async () => {
    vi.mocked(prisma.feedback.findUnique).mockResolvedValue({
      id: '1', conteudo: 'Olá mundo', audioGerado: null,
    } as any)
    vi.mocked(prisma.feedback.update).mockResolvedValue({} as any)

    const result = await service.gerarAudioDoFeedback('1')
    expect(sintetizarTexto).toHaveBeenCalledWith('Olá mundo')
    expect(Buffer.isBuffer(result.buffer)).toBe(true)
  })
})

describe('FeedbackService - getTranscricao', () => {
  it('deve lançar erro se feedback não existe', async () => {
    vi.mocked(prisma.feedback.findUnique).mockResolvedValue(null)
    await expect(service.getTranscricao('x')).rejects.toThrow('Feedback não encontrado')
  })

  it('deve retornar transcrição em cache', async () => {
    vi.mocked(prisma.feedback.findUnique).mockResolvedValue({
      id: '1', transcricao: 'já transcrito', arquivo: 'url',
    } as any)
    const result = await service.getTranscricao('1')
    expect(result).toBe('já transcrito')
    expect(transcreverAudio).not.toHaveBeenCalled()
  })

  it('deve lançar erro se sem áudio e sem transcrição', async () => {
    vi.mocked(prisma.feedback.findUnique).mockResolvedValue({
      id: '1', transcricao: null, arquivo: null,
    } as any)
    await expect(service.getTranscricao('1'))
      .rejects.toThrow('não possui áudio para transcrever')
  })
})
