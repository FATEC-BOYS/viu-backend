import { FastifyRequest, FastifyReply } from 'fastify'
import { LinkIndisponivelError, LinkService } from '../services/linkService.js'
import { FeedbackService } from '../services/feedbackService.js'
import { env } from '../config/env.js'
import { erroInterno } from '../utils/erroInterno.js'

const linkService = new LinkService()
const feedbackService = new FeedbackService()

export async function createSharedLink(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    if (!usuario?.id) {
      reply.status(401).send({ message: 'Usuário não autenticado', success: false })
      return
    }

    const data = request.body as {
      arteId: string
      expiraEm?: string
      somenteLeitura?: boolean
      limiteTentativas?: number
    }

    const link = await linkService.createSharedLink(
      {
        arteId: data.arteId,
        expiraEm: data.expiraEm,
        somenteLeitura: data.somenteLeitura ?? true,
        limiteTentativas: data.limiteTentativas,
      },
      usuario.id,
      usuario.tipo === 'ADMIN',
    )

    // /l/:token é o resolvedor público no front — ele consulta /preview/:token
    // e redireciona para o viewer da arte. /viewer/:token não existe.
    const url = `${env.FRONTEND_URL}/l/${link.token}`

    reply.status(201).send({
      message: 'Link compartilhado criado com sucesso',
      data: { url, token: link.token, limiteTentativas: link.limiteTentativas },
      success: true,
    })
  } catch (error: any) {
    if (error.message === 'Acesso negado') {
      reply.status(403).send({ message: 'Acesso negado', success: false })
      return
    }
    if (error.message.includes('não encontrad')) {
      reply.status(400).send({ message: error.message, success: false })
      return
    }
    erroInterno(request, reply, error, 'Erro ao criar link compartilhado')
  }
}

export async function revokeLink(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { id } = request.params as { id: string }
    await linkService.assertLinkOwnership(id, usuario.id, usuario.tipo === 'ADMIN')
    const link = await linkService.revokeLink(id)
    reply.send({ message: 'Link revogado com sucesso', data: link, success: true })
  } catch (error: any) {
    if (error.message === 'Acesso negado') {
      reply.status(403).send({ message: 'Acesso negado', success: false })
      return
    }
    if (error.message.includes('não encontrad')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    erroInterno(request, reply, error, 'Erro ao revogar link')
  }
}

export async function createFeedbackViaLink(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { token } = request.params as { token: string }
    const arteId = await linkService.resolveArteIdFromToken(token)
    const body = request.body as any

    // `via: 'link'`: quem comenta por link é revisor externo e não participa
    // do projeto — quem autorizou foi o token, já validado em
    // resolveArteIdFromToken (não revogado, não expirado, dentro do limite,
    // e não somenteLeitura).
    const feedback = await feedbackService.createFeedback(
      {
        conteudo: body.conteudo ?? '',
        tipo: body.tipo ?? 'TEXTO',
        arteId,
        autorId: usuario.id,
        posicaoX: body.posicaoX ?? null,
        posicaoY: body.posicaoY ?? null,
      },
      { via: 'link' },
    )

    reply.status(201).send({ message: 'Feedback criado', data: feedback, success: true })
  } catch (error: any) {
    if (error.message === 'somenteLeitura') {
      reply.status(403).send({ message: 'Este link é somente leitura — feedbacks não são permitidos', success: false })
      return
    }
    if (
      error.message.includes('inválido') ||
      error.message.includes('expirado') ||
      error.message.includes('revogado') ||
      error.message.includes('Limite') ||
      error.message.includes('não encontrad')
    ) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    erroInterno(request, reply, error, 'Erro ao criar feedback')
  }
}

export async function createAudioFeedbackViaLink(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { token } = request.params as { token: string }
    const arteId = await linkService.resolveArteIdFromToken(token)
    const audioData = (request as any).audioData

    if (!audioData) {
      reply.status(400).send({ message: 'Arquivo de áudio é obrigatório', success: false })
      return
    }

    const fields = audioData.fields as Record<string, any> | undefined
    const posicaoX = fields?.posicaoX?.value ? parseFloat(fields.posicaoX.value) : undefined
    const posicaoY = fields?.posicaoY?.value ? parseFloat(fields.posicaoY.value) : undefined

    const feedback = await feedbackService.createFeedbackComAudio({
      // Mesma justificativa do fluxo de texto por link — ver acima.
      origem: { via: 'link' },
      arteId,
      autorId: usuario.id,
      audioBuffer: audioData.buffer,
      filename: audioData.filename,
      posicaoX,
      posicaoY,
    })

    reply.status(201).send({ message: 'Feedback com áudio criado', data: feedback, success: true })
  } catch (error: any) {
    if (error.message === 'somenteLeitura') {
      reply.status(403).send({ message: 'Este link é somente leitura — feedbacks não são permitidos', success: false })
      return
    }
    if (
      error.message.includes('inválido') ||
      error.message.includes('expirado') ||
      error.message.includes('revogado') ||
      error.message.includes('Limite') ||
      error.message.includes('não encontrad')
    ) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    if (error.message.includes('OPENAI_API_KEY')) {
      reply.status(503).send({ message: 'Serviço de transcrição não configurado', success: false })
      return
    }
    erroInterno(request, reply, error, 'Erro ao criar feedback com áudio')
  }
}

export async function listLinks(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const links = await linkService.listLinks(usuario.id, usuario.tipo === 'ADMIN')
    reply.send({ data: links, success: true })
  } catch (erro) {
    request.log.error({ err: erro }, 'Erro ao listar links')
    reply.status(500).send({ message: 'Erro ao listar links', success: false })
  }
}

export async function updateLink(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { id } = request.params as { id: string }
    await linkService.assertLinkOwnership(id, usuario.id, usuario.tipo === 'ADMIN')
    const body = request.body as { expiraEm?: string | null; somenteLeitura?: boolean; limiteTentativas?: number | null }
    const link = await linkService.updateLink(id, body)
    reply.send({ message: 'Link atualizado', data: link, success: true })
  } catch (error: any) {
    if (error.message === 'Acesso negado') {
      reply.status(403).send({ message: 'Acesso negado', success: false })
      return
    }
    if (error.message.includes('não encontrad')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    erroInterno(request, reply, error, 'Erro ao atualizar link')
  }
}

export async function deleteLink(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { id } = request.params as { id: string }
    await linkService.assertLinkOwnership(id, usuario.id, usuario.tipo === 'ADMIN')
    await linkService.deleteLink(id)
    reply.send({ message: 'Link removido', success: true })
  } catch (error: any) {
    if (error.message === 'Acesso negado') {
      reply.status(403).send({ message: 'Acesso negado', success: false })
      return
    }
    if (error.message.includes('não encontrad')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    erroInterno(request, reply, error, 'Erro ao remover link')
  }
}

export async function getPreviewByToken(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const { token } = request.params as { token: string }
    const preview = await linkService.getPreviewByToken(token)
    reply.send({ data: preview, success: true })
  } catch (error: any) {
    /*
     * O MOTIVO vai junto — e isto derruba de propósito uma decisão anterior,
     * que era responder 404 genérico "para nunca revelar se o token existe mas
     * foi revogado/expirado".
     *
     * A preocupação não se sustenta neste formato de token. São 192 bits: não
     * dá para pescar um. Quem segura um token RECEBEU de alguém, então o
     * público da revelação é exatamente quem o designer — ou quem encaminhou —
     * quis que tivesse o link. E "este link expirou" é menos informação do que
     * um link que funciona entrega.
     *
     * Do outro lado da balança estava o cliente abrindo no celular, vendo
     * página em branco e voltando para o WhatsApp dizendo "não abriu" — sem o
     * designer saber se foi link errado, vencido ou revogado.
     *
     * 410 para o que existiu e acabou; 404 só para o que nunca existiu.
     */
    if (error instanceof LinkIndisponivelError) {
      const status = error.motivo === 'NAO_ENCONTRADO' ? 404 : 410
      reply.status(status).send({
        message: error.message,
        motivo: error.motivo,
        ...(error.expiraEm ? { expiraEm: error.expiraEm.toISOString() } : {}),
        success: false,
      })
      return
    }
    erroInterno(request, reply, error, 'Erro ao buscar preview')
  }
}
