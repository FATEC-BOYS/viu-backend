import { FastifyRequest, FastifyReply } from 'fastify'
import { ArteVersaoService } from '../services/arteVersaoService.js'
import { signPath } from '../utils/storage.js'
import prisma from '../database/client.js'

const arteVersaoService = new ArteVersaoService()

export async function listarVersoes(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const { id: arteId } = request.params as { id: string }
    const versoes = await arteVersaoService.listarVersoes(arteId)
    const versoesComUrl = await Promise.all(
      versoes.map(async (v: any) => ({
        ...v,
        arquivoUrl: await signPath(v.arquivo, 3600),
      })),
    )
    reply.send({ data: versoesComUrl, success: true })
  } catch (error: any) {
    if (error.message.includes('não encontrada')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({ message: 'Erro ao listar versões', success: false })
  }
}

export async function getVersaoById(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const { id: arteId, versaoId } = request.params as { id: string; versaoId: string }
    const versao = await arteVersaoService.getVersaoById(arteId, versaoId)
    const arquivoUrl = await signPath(versao.arquivo, 3600)
    reply.send({ data: { ...versao, arquivoUrl }, success: true })
  } catch (error: any) {
    if (error.message.includes('não encontrada') || error.message.includes('não encontrado')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({ message: 'Erro ao buscar versão', success: false })
  }
}

export async function uploadNovaVersao(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const { id: arteId } = request.params as { id: string }
    const usuario = (request as any).usuario
    const upload = (request as any).arteUploadData

    if (!upload) {
      reply.status(400).send({ message: 'Arquivo é obrigatório', success: false })
      return
    }

    // Authors and designers of the project can upload new versions
    if (usuario.tipo !== 'ADMIN') {
      const arte = await prisma.arte.findFirst({
        where: { id: arteId },
        select: { projeto: { select: { designerId: true, clienteId: true } } },
      })
      if (!arte || arte.projeto.designerId !== usuario.id) {
        reply.status(403).send({ message: 'Apenas o designer do projeto pode adicionar versões', success: false })
        return
      }
    }

    const descricao = upload.fields?.descricao ?? undefined

    const versao = await arteVersaoService.criarVersao({
      arteId,
      criadoPorId: usuario.id,
      buffer: upload.buffer,
      filename: upload.filename,
      mimetype: upload.mimetype,
      size: upload.size,
      descricao,
    })

    reply.status(201).send({ message: 'Nova versão criada com sucesso', data: versao, success: true })
  } catch (error: any) {
    if (error.message.includes('não encontrada')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({ message: 'Erro ao criar versão', success: false })
  }
}

export async function restaurarVersao(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const { id: arteId, versaoId } = request.params as { id: string; versaoId: string }
    const usuario = (request as any).usuario

    if (usuario.tipo !== 'ADMIN') {
      const arte = await prisma.arte.findFirst({
        where: { id: arteId },
        select: { projeto: { select: { designerId: true } } },
      })
      if (!arte || arte.projeto.designerId !== usuario.id) {
        reply.status(403).send({ message: 'Apenas o designer do projeto pode restaurar versões', success: false })
        return
      }
    }

    const arte = await arteVersaoService.restaurarVersao(arteId, versaoId, usuario.id)
    reply.send({ message: 'Versão restaurada com sucesso', data: arte, success: true })
  } catch (error: any) {
    if (error.message.includes('não encontrada') || error.message.includes('não encontrado')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    reply.status(500).send({ message: 'Erro ao restaurar versão', success: false })
  }
}
