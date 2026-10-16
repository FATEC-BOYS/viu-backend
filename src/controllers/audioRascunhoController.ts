import { FastifyRequest, FastifyReply } from 'fastify'
import prisma from '../database/client.js'
import { LinkService, LinkIndisponivelError } from '../services/linkService.js'
import { transcreverRascunho, RascunhoAudioError } from '../services/audioRascunhoService.js'
import { assertAcessoAoProjeto, PROJETO_ACCESS_SELECT } from '../utils/projectAccess.js'

export async function criarRascunhoAudio(request: FastifyRequest, reply: FastifyReply) {
  const usuario = (request as any).usuario
  const audio = (request as any).audioData
  if (!audio) return reply.status(400).send({ message: 'Arquivo de áudio é obrigatório', success: false })
  const { token } = request.params as { token?: string }
  let arteId: string
  try {
    arteId = token ? await new LinkService().resolveArteIdFromToken(token) : audio.fields?.arteId?.value
    const arte = arteId && await prisma.arte.findUnique({ where: { id: arteId }, include: { projeto: { select: PROJETO_ACCESS_SELECT } } })
    if (!arte) return reply.status(404).send({ message: 'Arte não encontrada', success: false })
    if (!token) assertAcessoAoProjeto(arte.projeto, usuario.id, usuario.tipo === 'ADMIN')
    if (Number(audio.fields?.versaoNumero?.value) !== arte.versao) return reply.status(409).send({ message: 'A versão da arte mudou. Reabra a versão atual para comentar.', success: false })
    if (audio.buffer.length > 25 * 1024 * 1024) return reply.status(413).send({ message: 'Grave um áudio menor para transcrever.', success: false })
    try {
      const data = await transcreverRascunho({ arteId, autorId: usuario.id, versao: arte.versao, audioBuffer: audio.buffer }, audio.filename, audio.mimetype)
      return reply.send({ data, success: true })
    } catch (erro) {
      if (erro instanceof RascunhoAudioError) return reply.status(422).send({ message: erro.message, success: false })
      request.log.warn('Transcrição do rascunho indisponível')
      return reply.status(503).send({ message: 'Não foi possível transcrever agora. Tente novamente ou envie o áudio sem transcrição.', success: false })
    }
  } catch (erro) {
    if (erro instanceof LinkIndisponivelError) return reply.status(410).send({ message: erro.message, success: false })
    if (erro instanceof Error && (erro.message === 'somenteLeitura' || erro.message.startsWith('Acesso negado'))) return reply.status(403).send({ message: 'Você não pode comentar nesta arte.', success: false })
    request.log.error({ err: erro }, 'Erro ao preparar rascunho de áudio')
    return reply.status(500).send({ message: 'Não foi possível preparar o áudio.', success: false })
  }
}
