import prisma from '../database/client.js'
import { uploadFile, signPath } from '../utils/storage.js'

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

    const novoNumero = arte.versao + 1
    const ext = filename.includes('.') ? filename.split('.').pop() : ''
    const key = `artes/${arteId}/v${novoNumero}/${arteId}${ext ? '.' + ext : ''}`
    await uploadFile(key, buffer, mimetype)

    const [versao] = await prisma.$transaction([
      prisma.arteVersao.create({
        data: {
          arteId,
          numero: novoNumero,
          arquivo: key,
          tipo: mimetype,
          tamanho: BigInt(size),
          descricao: descricao ?? null,
          criadoPorId,
        },
      }),
      prisma.arte.update({
        where: { id: arteId },
        data: { arquivo: key, tipo: mimetype, tamanho: BigInt(size), versao: novoNumero },
      }),
    ])

    return versao
  }

  // Restores arte to point to the specified versao's file, bumping the version counter.
  async restaurarVersao(arteId: string, versaoId: string, restauradoPorId: string) {
    const [arte, versao] = await Promise.all([
      prisma.arte.findUnique({ where: { id: arteId } }),
      prisma.arteVersao.findUnique({ where: { id: versaoId } }),
    ])
    if (!arte) throw new Error('Arte não encontrada')
    if (!versao || versao.arteId !== arteId) throw new Error('Versão não encontrada')

    const novoNumero = arte.versao + 1

    // Snapshot current state before overwriting, then restore
    await prisma.$transaction([
      prisma.arteVersao.create({
        data: {
          arteId,
          numero: novoNumero,
          arquivo: arte.arquivo,
          tipo: arte.tipo,
          tamanho: arte.tamanho,
          descricao: `Snapshot antes de restauração para v${versao.numero}`,
          criadoPorId: restauradoPorId,
        },
      }),
      prisma.arte.update({
        where: { id: arteId },
        data: {
          arquivo: versao.arquivo,
          tipo: versao.tipo,
          tamanho: versao.tamanho,
          versao: novoNumero + 1,
        },
      }),
    ])

    return prisma.arte.findUnique({ where: { id: arteId } })
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
