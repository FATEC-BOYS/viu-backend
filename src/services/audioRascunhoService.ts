import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { getJWTSecret } from '../config/env.js'
import { transcreverAudio } from './transcricaoService.js'

export class RascunhoAudioError extends Error {}
const assinatura = (texto: string) => createHmac('sha256', getJWTSecret()).update('viu-audio-rascunho-v1:' + texto).digest()
const hashAudio = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex')
type Vinculo = { arteId: string; autorId: string; versao: number; audioBuffer: Buffer }

/** A transcrição é um rascunho: não cria feedback nem grava arquivo no bucket. */
export async function transcreverRascunho(vinculo: Vinculo, filename: string, mimetype: string) {
  const transcricao = (await transcreverAudio(vinculo.audioBuffer, filename, mimetype)).trim()
  if (!transcricao) throw new RascunhoAudioError('Não identificamos fala nesta gravação. Tente novamente ou escreva o comentário.')
  if (transcricao.length > 10000) throw new RascunhoAudioError('A gravação é longa demais. Grave um comentário mais curto.')
  const payload = Buffer.from(JSON.stringify({ arteId: vinculo.arteId, autorId: vinculo.autorId, versao: vinculo.versao, hash: hashAudio(vinculo.audioBuffer), transcricao, expira: Date.now() + 30 * 60 * 1000 })).toString('base64url')
  return { transcricao, recibo: payload + '.' + assinatura(payload).toString('base64url') }
}

/** O recibo vincula a transcrição original ao áudio, autor, arte e versão. Não é token de login. */
export function lerRascunho(recibo: string, vinculo: Vinculo): string {
  try {
    if (recibo.length > 65000) throw new Error()
    const [payload, sig, extra] = recibo.split('.')
    if (!payload || !sig || extra) throw new Error()
    const fornecida = Buffer.from(sig, 'base64url')
    const esperada = assinatura(payload)
    if (fornecida.length !== esperada.length || !timingSafeEqual(fornecida, esperada)) throw new Error()
    const dados = JSON.parse(Buffer.from(payload, 'base64url').toString())
    if (!Number.isFinite(dados.expira) || dados.expira < Date.now() || dados.arteId !== vinculo.arteId || dados.autorId !== vinculo.autorId || dados.versao !== vinculo.versao || dados.hash !== hashAudio(vinculo.audioBuffer) || typeof dados.transcricao !== 'string') throw new Error()
    return dados.transcricao
  } catch {
    throw new RascunhoAudioError('Este rascunho expirou ou a versão mudou. Transcreva novamente antes de enviar.')
  }
}
