import prisma from '../database/client.js'
import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { uploadFile, deleteFile, signPath } from '../utils/storage.js'

/** Bloqueia antes de ler o contador: uploads e restaurações disputam a mesma fila. */
async function bloquearArte(tx: Prisma.TransactionClient, arteId: string) {
  await tx.$queryRaw`SELECT id FROM artes WHERE id = ${arteId} FOR UPDATE`
  const arte = await tx.arte.findUnique({ where: { id: arteId } })
  if (!arte) throw new Error('Arte não encontrada')
  return arte
}

/** A v1 legada não tinha snapshot. Preserva-a antes de trocar o ponteiro. */
async function preservarAtual(tx: Prisma.TransactionClient, arte: {
  id: string; versao: number; arquivo: string; tipo: string; tamanho: bigint;
  autorId: string; criadoEm: Date;
}) {
  const existe = await tx.arteVersao.findFirst({ where: { arteId: arte.id, numero: arte.versao } })
  if (!existe) await tx.arteVersao.create({ data: {
    arteId: arte.id, numero: arte.versao, arquivo: arte.arquivo, tipo: arte.tipo,
    tamanho: arte.tamanho, criadoPorId: arte.autorId, criadoEm: arte.criadoEm,
    descricao: 'Entrega preservada antes de uma nova versão',
  } })
}

export class ArteVersaoService {
  async listarVersoes(arteId: string) {
    const arte = await prisma.arte.findUnique({ where: { id: arteId } })
    if (!arte) throw new Error('Arte não encontrada')

    const versoes = await prisma.arteVersao.findMany({
      where: { arteId },
      include: { criadoPor: { select: { id: true, nome: true } } },
      orderBy: { numero: 'desc' },
    })

    return versoes
  }

  async getVersaoById(arteId: string, versaoId: string) {
    const versao = await prisma.arteVersao.findUnique({
      where: { id: versaoId },
      include: { criadoPor: { select: { id: true, nome: true } } },
    })
    if (!versao || versao.arteId !== arteId) throw new Error('Versão não encontrada')
    return versao
  }

  // Saves new file as a versao snapshot and updates Arte to point to it.
  async criarVersao(params: {
    arteId: string
    criadoPorId: string
    buffer: Buffer
    filename: string
    mimetype: string
    size: number
    descricao?: string
  }) {
    const { arteId, criadoPorId, buffer, filename, mimetype, size, descricao } = params

    const arte = await prisma.arte.findUnique({ where: { id: arteId } })
    if (!arte) throw new Error('Arte não encontrada')

    // Cada requisição possui seu próprio objeto, mesmo quando os uploads concorrem.
    const ext = filename.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)
    const key = `artes/${arteId}/entregas/${randomUUID()}${ext ? '.' + ext : ''}`
    await uploadFile(key, buffer, mimetype)
    try {
      return await prisma.$transaction(async (tx) => {
        const atual = await bloquearArte(tx, arteId)
        await preservarAtual(tx, atual)
        const numero = atual.versao + 1
        const versao = await tx.arteVersao.create({ data: {
          arteId, numero, arquivo: key, tipo: mimetype, tamanho: BigInt(size),
          descricao: descricao ?? null, criadoPorId,
        } })
        await tx.arte.update({ where: { id: arteId }, data: {
          arquivo: key, tipo: mimetype, tamanho: BigInt(size), versao: numero,
          // É uma entrega nova, inclusive quando a anterior já estava aprovada.
          status: 'EM_ANALISE',
        } })
        return versao
      })
    } catch (error) {
      // Este objeto é exclusivo da requisição: nunca remove uma entrega anterior.
      await deleteFile(key).catch(erro => console.error('Falha ao limpar upload não gravado', erro))
      throw error
    }
  }

  /** Restaurar cria uma nova entrega, mantendo arquivo e decisão anteriores. */
  async restaurarVersao(arteId: string, versaoId: string, restauradoPorId: string) {
    return prisma.$transaction(async (tx) => {
      const atual = await bloquearArte(tx, arteId)
      const origem = await tx.arteVersao.findUnique({ where: { id: versaoId } })
      if (!origem || origem.arteId !== arteId) throw new Error('Versão não encontrada')
      await preservarAtual(tx, atual)
      const numero = atual.versao + 1
      await tx.arteVersao.create({ data: {
        arteId, numero, arquivo: origem.arquivo, tipo: origem.tipo, tamanho: origem.tamanho,
        descricao: `Restauração da v${origem.numero}`, criadoPorId: restauradoPorId,
      } })
      return tx.arte.update({ where: { id: arteId }, data: {
        arquivo: origem.arquivo, tipo: origem.tipo, tamanho: origem.tamanho,
        versao: numero, status: 'EM_ANALISE',
      } })
    })
  }

  async signVersaoUrl(versao: { arquivo: string }) {
    return signPath(versao.arquivo, 3600)
  }
}

const _svc = new ArteVersaoService()
export const listarVersoes = (...args: Parameters<ArteVersaoService['listarVersoes']>) => _svc.listarVersoes(...args)
export const getVersaoById = (...args: Parameters<ArteVersaoService['getVersaoById']>) => _svc.getVersaoById(...args)
export const criarVersao = (...args: Parameters<ArteVersaoService['criarVersao']>) => _svc.criarVersao(...args)
export const restaurarVersao = (...args: Parameters<ArteVersaoService['restaurarVersao']>) => _svc.restaurarVersao(...args)
