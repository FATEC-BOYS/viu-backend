import { FastifyRequest, FastifyReply } from 'fastify'
import { randomUUID } from 'crypto'
import { ArteService, ListArtesParams } from '../services/arteService.js'
import { NotificacaoService } from '../services/notificacaoService.js'
import { uploadFile, signPath } from '../utils/storage.js'
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

    if (usuario.tipo !== 'ADMIN') {
      const projetos = await prisma.projeto.findMany({
        where: { OR: [{ designerId: usuario.id }, { clienteId: usuario.id }] },
        select: { id: true },
      })
      const accessibleIds = projetos.map((p: { id: string }) => p.id)

      if (params.projetoId && !accessibleIds.includes(params.projetoId)) {
        reply.status(403).send({ message: 'Acesso negado', success: false })
        return
      }
      params.projetoIds = accessibleIds
    }

    const { artes, total } = await arteService.listArtes(params)
    reply.send({
      data: artes,
      pagination: { page: params.page, limit: params.limit, total, pages: Math.ceil(total / params.limit!) },
      success: true,
    })
  } catch {
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

    // Block download for clients with an unpaid fatura on this project (CDC art. 49)
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
    reply.send({ data: { ...arte, arquivo_url, feedbacks: feedbacksComUrl }, success: true })
  } catch {
    reply.status(500).send({ message: 'Erro ao buscar arte', success: false })
  }
}

export async function uploadAndCreateArte(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const upload = (request as any).arteUploadData
    const { nome, descricao, projetoId } = upload.fields

    // verify project access for non-admins
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

    const arteId = randomUUID()
    const key = `artes/${projetoId}/${arteId}/v1/${upload.filename}`
    await uploadFile(key, upload.buffer, upload.mimetype)
    const previewUrl = await signPath(key, 3600 * 24)

    const arte = await arteService.createArte({
      id: arteId,
      nome,
      descricao,
      tipo: upload.mimetype,
      tamanho: upload.size,
      arquivo: key,
      projetoId,
      autorId: usuario.id,
    })

    // fire-and-forget: notifica o designer que criou a arte
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
    reply.status(500).send({ message: 'Erro ao criar arte', success: false })
  }
}

export async function createArte(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const body = request.body as any
    // Whitelist fields — never accept status, versao, or autorId from client
    const data = {
      nome: body.nome,
      descricao: body.descricao,
      tipo: body.tipo,
      tamanho: body.tamanho,
      arquivo: body.arquivo,
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
    const { id } = request.params as { id: string }
    const body = request.body as any
    // Whitelist fields — never accept autorId, projetoId, or status override from client
    const allowedUpdates: Record<string, any> = {}
    for (const field of ['nome', 'descricao', 'tipo', 'tamanho', 'arquivo'] as const) {
      if (body[field] !== undefined) allowedUpdates[field] = body[field]
    }
    const arte = await arteService.updateArte(id, allowedUpdates)
    reply.send({ message: 'Arte atualizada com sucesso', data: arte, success: true })
  } catch (error: any) {
    if (error.message.includes('Arte não encontrada')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({ message: 'Erro ao atualizar arte', success: false })
  }
}

export async function deleteArte(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const { id } = request.params as { id: string }
    await arteService.deleteArte(id)
    reply.send({ message: 'Arte removida com sucesso', success: true })
  } catch (error: any) {
    if (error.message.includes('Arte não encontrada')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({ message: 'Erro ao remover arte', success: false })
  }
}
