import { criarRascunhoAudio } from '../controllers/audioRascunhoController.js'
import { FastifyInstance } from 'fastify'
import { LinkService, LinkIndisponivelError } from '../services/linkService.js'
import { erroInterno } from '../utils/erroInterno.js'
import {
  createSharedLink,
  getPreviewByToken,
  getDestinoByToken,
  listLinks,
  updateLink,
  deleteLink,
  revokeLink,
  createFeedbackViaLink,
  createAudioFeedbackViaLink,
  getAudioDoFeedbackViaLink,
} from '../controllers/linkController.js'
import { authenticate } from '../middleware/authMiddleware.js'
import { chaveDoComentario } from '../utils/rateLimitComentario.js'
import { validateAudioUpload } from '../middleware/fileUploadMiddleware.js'
import { requireEmailVerificado } from '../middleware/emailVerificadoMiddleware.js'

export async function linksRoutes(fastify: FastifyInstance) {
  fastify.post('/links/:token/feedbacks/audio/rascunho', {
    config: { rateLimit: { max: 10, timeWindow: '1 hour', keyGenerator: chaveDoComentario } },
    preHandler: [authenticate, validateAudioUpload],
  }, criarRascunhoAudio)

  fastify.post('/links', {
    // 20 links por hora — geração massiva de links é um vetor de crawling
    config: { rateLimit: { max: 20, timeWindow: '1 hour' } },
    preHandler: [authenticate, requireEmailVerificado],
  }, createSharedLink)

  fastify.get('/links', { preHandler: [authenticate] }, listLinks)
  fastify.put('/links/:id', { preHandler: [authenticate] }, updateLink)
  fastify.delete('/links/:id', { preHandler: [authenticate] }, deleteLink)

  // Revogação explícita — mantém o registro no banco (diferente de delete)
  fastify.put('/links/:id/revogar', { preHandler: [authenticate] }, revokeLink)

  fastify.get('/preview/:token', {
    // Endpoint público sem auth — protege contra enumeração de tokens e scraping
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, getPreviewByToken)

  // Só o destino, sem contar acesso: é o que `/l/<token>` precisa para
  // redirecionar. Mesmo teto do preview — é a mesma superfície pública.
  fastify.get('/preview/:token/versoes', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    try {
      const { token } = request.params as { token: string }
      return reply.send({ data: await new LinkService().listarVersoesPorToken(token), success: true })
    } catch (error) {
      if (error instanceof LinkIndisponivelError) {
        return reply.status(410).send({ message: error.message, motivo: error.motivo, success: false })
      }
      return erroInterno(request, reply, error, 'Não foi possível carregar as versões')
    }
  })

  fastify.get('/preview/:token/destino', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, getDestinoByToken)

  /*
   * Esta é a porta pública do produto: o link é encaminhável e qualquer um que
   * o tenha chega até aqui. Escrever, porém, nunca foi liberado pelo token —
   * `authenticate` vem antes, e o autor sai de `usuario.id`. Faltava o limite
   * próprio: sem ele valia só o global (compartilhado com toda a API), que é
   * largo demais para a superfície de escrita mais exposta que temos.
   *
   * 20/minuto é o que já vale em `POST /feedbacks`, e de propósito: é a mesma
   * pessoa escrevendo na mesma arte, mudando só por qual porta entrou. Cobre
   * quem marca vários pontos seguidos numa peça e não cobre script.
   */
  fastify.post('/links/:token/feedbacks', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute', keyGenerator: chaveDoComentario } },
    preHandler: [authenticate],
  }, createFeedbackViaLink)
  fastify.post('/links/:token/feedbacks/audio', {
    // 10 transcrições por hora — chamada cara (OpenAI Whisper)
    config: { rateLimit: { max: 10, timeWindow: '1 hour', keyGenerator: chaveDoComentario } },
    preHandler: [authenticate, validateAudioUpload],
  }, createAudioFeedbackViaLink)

  /*
   * Ouvir um comentário de texto, pela porta do link.
   *
   * `authenticate` como as vizinhas: o token autoriza LER a arte, e a síntese
   * custa dinheiro na conta da OpenAI — então o gatilho é a pessoa na conta
   * dela, com limite por credencial, e não o token encaminhável.
   *
   * 30/hora porque a primeira chamada de cada comentário sintetiza (e cobra) e
   * as seguintes vêm do bucket: o teto serve para o caso de alguém percorrer
   * comentário por comentário, não para o uso normal de ouvir alguns.
   */
  fastify.get('/links/:token/feedbacks/:id/audio', {
    config: { rateLimit: { max: 30, timeWindow: '1 hour', keyGenerator: chaveDoComentario } },
    preHandler: [authenticate],
  }, getAudioDoFeedbackViaLink)
}
