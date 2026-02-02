// src/services/transcricaoService.ts
/**
 * Serviço de Transcrição e Síntese de Voz
 *
 * Utiliza a API da OpenAI (Whisper para STT, TTS-1 para síntese)
 * para converter áudio em texto e texto em áudio.
 *
 * Configuração necessária:
 *   OPENAI_API_KEY no .env
 */

import OpenAI from 'openai'

let openaiInstance: OpenAI | null = null

function getOpenAI(): OpenAI {
  if (!openaiInstance) {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error(
        'OPENAI_API_KEY não configurada. Defina a variável de ambiente para usar transcrição/TTS.',
      )
    }
    openaiInstance = new OpenAI({ apiKey })
  }
  return openaiInstance
}

/**
 * Transcreve um buffer de áudio para texto usando Whisper.
 */
export async function transcreverAudio(
  audioBuffer: Buffer,
  filename = 'audio.webm',
): Promise<string> {
  const openai = getOpenAI()
  const file = new File([audioBuffer], filename, { type: 'audio/webm' })
  const response = await openai.audio.transcriptions.create({
    model: 'whisper-1',
    file,
    language: 'pt',
  })
  return response.text
}

/**
 * Sintetiza texto em áudio (MP3) usando TTS-1.
 * Retorna o buffer do áudio gerado.
 */
export async function sintetizarTexto(
  texto: string,
  voz: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer' = 'nova',
): Promise<Buffer> {
  const openai = getOpenAI()
  const response = await openai.audio.speech.create({
    model: 'tts-1',
    voice: voz,
    input: texto,
  })
  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}
