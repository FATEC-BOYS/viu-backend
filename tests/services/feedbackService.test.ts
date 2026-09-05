import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FeedbackService } from '../../src/services/feedbackService.js'

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  return { default: criarPrismaMock() }
})

// O serviço usa utils/storage (R2). Sem este mock o teste
// tentava rede de verdade e morria com ENOTFOUND viu.r2.example.com.
vi.mock('../../src/utils/storage.js', () => ({
  uploadFile: vi.fn().mockResolvedValue(undefined),
  signPath: vi.fn().mockResolvedValue('https://storage.test/audio.webm'),
  signPaths: vi.fn().mockResolvedValue([]),
  deleteFile: vi.fn().mockResolvedValue(undefined),
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

// A arte precisa carregar o projeto: createFeedbackComAudio agora confere se
// o autor participa dele. Os casos aqui são sobre transcrição e formato do
// registro — a negação cross-tenant é coberta em tests/security.
const ARTE_COM_PROJETO = (id: string, autorId: string) => ({
  id,
  projeto: { designerId: autorId, clienteId: 'cliente-1' },
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
    vi.mocked(prisma.arte.findUnique).mockResolvedValue(ARTE_COM_PROJETO('art1', 'usr1') as any)
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
        // guarda o caminho no bucket; a URL assinada é gerada na leitura
        arquivo: expect.stringMatching(/^feedbacks\/art1\/\d+_audio\.webm$/),
      }),
    }))
    expect(result.tipo).toBe('POSICIONAL')
  })

  it('deve criar feedback AUDIO se sem coordenadas', async () => {
    vi.mocked(prisma.arte.findUnique).mockResolvedValue(ARTE_COM_PROJETO('art1', 'usr1') as any)
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
