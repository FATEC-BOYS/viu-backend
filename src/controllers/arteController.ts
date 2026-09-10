import { FastifyRequest, FastifyReply } from 'fastify'
import { ArteService, ListArtesParams } from '../services/arteService.js'
import { NotificacaoService } from '../services/notificacaoService.js'
import { uploadFile, signPath, deleteFile } from '../utils/storage.js'
import { getAccessibleProjectIds } from '../utils/projectAccess.js'
import { novoId } from '../utils/ids.js'
import prisma from '../database/client.js'

const arteService = new ArteService()
const notificacaoService = new NotificacaoService()

export async function listArtes(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { page = 1, limit = 10, projetoId, autorId, status, tipo, search } =
      (request.query || {}) as any
    const params: ListArtesParams = {
      page: Number(page) || 1,
      limit: Number(limit) || 10,
      projetoId: projetoId as string | undefined,
      autorId: autorId as string | undefined,
      status: status as string | undefined,
      tipo: tipo as string | undefined,
      search: search as string | undefined,
    }

    const acessiveis = await getAccessibleProjectIds(usuario.id, usuario.tipo === 'ADMIN')
    if (acessiveis) {
      // 403 explícito em vez de lista vazia: pedir um projeto que não é seu é
      // erro de autorização, não resultado sem itens.
      if (params.projetoId && !acessiveis.includes(params.projetoId)) {
        reply.status(403).send({ message: 'Acesso negado', success: false })
        return
      }
      params.projetoIds = acessiveis
    }

    const { artes, total } = await arteService.listArtes(params)
    /**
     * A lista devolvia só `arquivo`, que é a chave do bucket — e a grade de
     * artes ficava com o ícone de imagem quebrada, porque chave crua no `src`
     * de um `<img>` não carrega nada. Assinar aqui é o que a torna exibível.
     *
     * O nome do campo é `previewUrl` porque é o que a resposta do upload já
     * devolve e o que o frontend lê. O detalhe da arte chamava a mesma coisa
     * de `arquivo_url` e as versões de `arquivoUrl`: três nomes para o mesmo
     * dado foi como a leitura ficou para trás sem ninguém notar.
     */
    const artesComPreview = await Promise.all(
      artes.map(async (arte: any) => ({
        ...arte,
        previewUrl: await signPath(arte.arquivo),
      })),
    )
    reply.send({
      data: artesComPreview,
      pagination: { page: params.page, limit: params.limit, total, pages: Math.ceil(total / params.limit!) },
      success: true,
    })
  } catch (erro) {
    request.log.error({ erro }, 'Erro ao listar artes')
    reply.status(500).send({ message: 'Erro ao listar artes', success: false })
  }
}

export async function getArteById(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const { id } = request.params as { id: string }
    const arte = await arteService.getArteById(id)
    if (!arte) {
      reply.status(404).send({ message: 'Arte não encontrada', success: false })
      return
    }

    // Block download for clients with an unpaid fatura (CDC art. 49)
    const usuario = (request as any).usuario
    if (usuario?.tipo === 'CLIENTE') {
      const faturasPendentes = await prisma.fatura.count({
        where: { projetoId: arte.projetoId, clienteId: usuario.id, status: 'PENDENTE' },
      })
      if (faturasPendentes > 0) {
        reply.status(402).send({
          message: 'Pagamento pendente. Quite a fatura do projeto para acessar os arquivos.',
          success: false,
        })
        return
      }
    }

    const arquivo_url = await signPath(arte.arquivo)
    const feedbacksComUrl = await Promise.all(
      (arte.feedbacks || []).map(async (fb: any) => ({
        ...fb,
        arquivo_url: fb.tipo === 'AUDIO' && fb.arquivo ? await signPath(fb.arquivo) : null,
      })),
    )
    // `previewUrl` é o nome que o frontend lê; `arquivo_url` fica porque a
    // tela de feedbacks ainda o consome para o áudio.
    reply.send({
      data: { ...arte, arquivo_url, previewUrl: arquivo_url, feedbacks: feedbacksComUrl },
      success: true,
    })
  } catch (erro) {
    request.log.error({ erro }, 'Erro ao buscar arte')
    reply.status(500).send({ message: 'Erro ao buscar arte', success: false })
  }
}

export async function uploadAndCreateArte(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const upload = (request as any).arteUploadData
    const { nome, descricao, projetoId } = upload.fields

    if (usuario.tipo !== 'ADMIN') {
      const projeto = await prisma.projeto.findFirst({
        where: { id: projetoId, OR: [{ designerId: usuario.id }, { clienteId: usuario.id }] },
        select: { id: true },
      })
      if (!projeto) {
        reply.status(403).send({ message: 'Acesso negado ao projeto', success: false })
        return
      }
    }

    // O id precisa existir antes do upload porque a chave do bucket é montada
    // com ele. Tem que ser no formato do banco: `randomUUID()` devolvia um
    // UUID, e aí a arte subia e nenhuma rota `/:id` aceitava o id dela.
    const arteId = novoId()
    // Always use a UUID-based key — never trust the original filename for the storage path
    const ext = upload.filename.includes('.') ? upload.filename.split('.').pop() : ''
    const key = `artes/${projetoId}/${arteId}/v1/${arteId}${ext ? '.' + ext : ''}`
    await uploadFile(key, upload.buffer, upload.mimetype)
    const previewUrl = await signPath(key, 3600 * 24)

    const arte = await arteService.createArte({
      id: arteId,
      nome,
      descricao,
      tipo: upload.mimetype,
      tamanho: BigInt(upload.size),
      arquivo: key,
      projetoId,
      autorId: usuario.id,
    })

    notificacaoService.createNotificacao({
      titulo: 'Arte criada',
      conteudo: `${nome} — versão 1`,
      tipo: 'ARTE',
      canal: 'SISTEMA',
      usuarioId: usuario.id,
    }).catch(() => {})

    reply.status(201).send({ data: { ...arte, previewUrl }, success: true })
  } catch (error: any) {
    if (error.message?.includes('não encontrado')) {
      reply.status(400).send({ message: error.message, success: false })
      return
    }
    // Sem esta linha o upload falhava e o log registrava apenas
    // `{"res":{"statusCode":500}}` — a causa (R2 fora do ar, credencial
    // errada, banco recusando) morria aqui e o diagnóstico virava adivinhação.
    request.log.error({ erro: error }, 'Falha no upload da arte')
    reply.status(500).send({ message: 'Erro ao criar arte', success: false })
  }
}

export async function createArte(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const body = request.body as any
    const data = {
      nome: body.nome,
      descricao: body.descricao,
      tipo: body.tipo,
      // arquivo and tamanho are set only by the upload flow — never accepted from JSON body
      projetoId: body.projetoId,
      autorId: usuario.id,
    }
    const arte = await arteService.createArte(data)
    reply.status(201).send({ message: 'Arte criada com sucesso', data: arte, success: true })
  } catch (error: any) {
    if (error.message.includes('não encontrado')) {
      reply.status(400).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({ message: 'Erro ao criar arte', success: false })
  }
}

export async function updateArte(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { id } = request.params as { id: string }
    const body = request.body as any
    const allowedUpdates: Record<string, any> = {}
    // arquivo, tipo and tamanho are immutable outside the upload flow
    for (const field of ['nome', 'descricao'] as const) {
      if (body[field] !== undefined) allowedUpdates[field] = body[field]
    }
    const arte = await arteService.updateArte(
      id,
      allowedUpdates,
      usuario.id,
      usuario.tipo === 'ADMIN',
    )
    reply.send({ message: 'Arte atualizada com sucesso', data: arte, success: true })
  } catch (error: any) {
    if (error.message.includes('Arte não encontrada')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    if (error.message.includes('Acesso negado')) {
      reply.status(403).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({ message: 'Erro ao atualizar arte', success: false })
  }
}

export async function deleteArte(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { id } = request.params as { id: string }

    // Fetch before delete to get the storage key
    const arte = await arteService.getArteById(id)
    if (!arte) {
      reply.status(404).send({ message: 'Arte não encontrada', success: false })
      return
    }

    await arteService.deleteArte(id, usuario.id, usuario.tipo === 'ADMIN')

    // Remove from object storage — fire-and-forget so DB delete is never rolled back
    if (arte.arquivo) deleteFile(arte.arquivo).catch(() => {})

    reply.send({ message: 'Arte removida com sucesso', success: true })
  } catch (error: any) {
    if (error.message.includes('Arte não encontrada')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    if (error.message.includes('Acesso negado')) {
      reply.status(403).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({ message: 'Erro ao remover arte', success: false })
  }
}
