import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock OpenAI before importing the module
vi.mock('openai', () => {
  const mockCreate = vi.fn()
  const mockSpeechCreate = vi.fn()
  return {
    default: vi.fn().mockImplementation(() => ({
      audio: {
        transcriptions: { create: mockCreate },
        speech: { create: mockSpeechCreate },
      },
    })),
    __mockTranscriptionCreate: mockCreate,
    __mockSpeechCreate: mockSpeechCreate,
  }
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  // Reset the module so the singleton openai instance is re-created
  vi.resetModules()
})

describe('transcreverAudio', () => {
  it('deve lançar erro se OPENAI_API_KEY não está definida', async () => {
    delete process.env.OPENAI_API_KEY
    const { transcreverAudio } = await import('../../src/services/transcricaoService.js')
    const buffer = Buffer.from('fake audio')
    await expect(transcreverAudio(buffer)).rejects.toThrow('OPENAI_API_KEY não configurada')
  })

  it('deve transcrever áudio com sucesso', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    const { transcreverAudio } = await import('../../src/services/transcricaoService.js')
    const OpenAI = (await import('openai')).default
    const instance = new OpenAI()
    // Access the mock via the instance
    vi.mocked(instance.audio.transcriptions.create).mockResolvedValue({ text: 'transcrição teste' } as any)

    // Since the module creates its own instance, we need to mock at constructor level
    // The mock is set up in the factory above
    const { __mockTranscriptionCreate } = await import('openai') as any
    __mockTranscriptionCreate.mockResolvedValue({ text: 'olá mundo' })

    const result = await transcreverAudio(Buffer.from('audio data'), 'test.webm')
    expect(result).toBe('olá mundo')
  })
})

describe('sintetizarTexto', () => {
  it('deve lançar erro se OPENAI_API_KEY não está definida', async () => {
    delete process.env.OPENAI_API_KEY
    const { sintetizarTexto } = await import('../../src/services/transcricaoService.js')
    await expect(sintetizarTexto('teste')).rejects.toThrow('OPENAI_API_KEY não configurada')
  })

  it('deve sintetizar texto com sucesso', async () => {
    process.env.OPENAI_API_KEY = 'test-key'
    const { sintetizarTexto } = await import('../../src/services/transcricaoService.js')
    const audioBytes = new Uint8Array([1, 2, 3, 4])
    const { __mockSpeechCreate } = await import('openai') as any
    __mockSpeechCreate.mockResolvedValue({
      arrayBuffer: () => Promise.resolve(audioBytes.buffer),
    })

    const result = await sintetizarTexto('olá')
    expect(Buffer.isBuffer(result)).toBe(true)
    expect(result.length).toBe(4)
  })
})
