import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('../../src/services/transcricaoService.js', () => ({ transcreverAudio: vi.fn().mockResolvedValue('Talvez aumentar o título.') }))
import { transcreverRascunho, lerRascunho } from '../../src/services/audioRascunhoService.js'
import { transcreverAudio } from '../../src/services/transcricaoService.js'
const vinculo = { arteId: 'arte', autorId: 'cliente', versao: 2, audioBuffer: Buffer.from('audio') }
beforeEach(() => { vi.clearAllMocks(); vi.useRealTimers() })
describe('rascunho de áudio', () => {
  it('mantém a fala e formato reais e vincula o resultado sem publicar', async () => {
    const r = await transcreverRascunho(vinculo, 'fala.m4a', 'audio/mp4')
    expect(r.transcricao).toBe('Talvez aumentar o título.')
    expect(transcreverAudio).toHaveBeenCalledWith(vinculo.audioBuffer, 'fala.m4a', 'audio/mp4')
    expect(lerRascunho(r.recibo, vinculo)).toBe(r.transcricao)
  })
  it.each([{ arteId: 'outra' }, { autorId: 'outro' }, { versao: 3 }, { audioBuffer: Buffer.from('outro audio') }])('recusa recibo de outro contexto: %j', async outro => {
    const r = await transcreverRascunho(vinculo, 'fala.webm', 'audio/webm')
    expect(() => lerRascunho(r.recibo, { ...vinculo, ...outro })).toThrow('rascunho expirou')
  })
  it('recusa adulteração e expiração', async () => {
    vi.useFakeTimers()
    const r = await transcreverRascunho(vinculo, 'fala.webm', 'audio/webm')
    expect(() => lerRascunho(r.recibo + 'x', vinculo)).toThrow()
    vi.advanceTimersByTime(31 * 60 * 1000)
    expect(() => lerRascunho(r.recibo, vinculo)).toThrow()
  })
  it('informa quando não há fala reconhecida', async () => {
    vi.mocked(transcreverAudio).mockResolvedValueOnce('  ')
    await expect(transcreverRascunho(vinculo, 'fala.webm', 'audio/webm')).rejects.toThrow('Não identificamos fala')
  })
})
