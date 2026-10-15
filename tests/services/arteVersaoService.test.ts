import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  return { default: criarPrismaMock() }
})
vi.mock('../../src/utils/storage.js', () => ({ uploadFile: vi.fn().mockResolvedValue(undefined), deleteFile: vi.fn().mockResolvedValue(undefined), signPath: vi.fn().mockResolvedValue('url') }))
import prisma from '../../src/database/client.js'
import { uploadFile, deleteFile } from '../../src/utils/storage.js'
import { ArteVersaoService } from '../../src/services/arteVersaoService.js'
const service = new ArteVersaoService()
const atual = { id: 'art1', versao: 1, status: 'EM_ANALISE', arquivo: 'original.png', tipo: 'image/png', tamanho: 1n, autorId: 'd1', criadoEm: new Date() }
const subir = () => service.criarVersao({ arteId: 'art1', buffer: Buffer.from('x'), filename: 'capa.png', mimetype: 'image/png', size: 1, criadoPorId: 'd1' })
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.arte.findUnique).mockResolvedValue(atual as any)
  vi.mocked(prisma.arteVersao.findFirst).mockResolvedValue(null)
  vi.mocked(prisma.arteVersao.create).mockImplementation(async ({ data }: any) => data)
})
it.each(['REJEITADO', 'APROVADO', 'EM_ANALISE'])('nova versão de %s sempre abre outra revisão', async status => {
  vi.mocked(prisma.arte.findUnique).mockResolvedValue({ ...atual, status } as any)
  const versao = await subir()
  expect(versao.numero).toBe(2)
  expect(prisma.arte.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ versao: 2, status: 'EM_ANALISE' }) }))
})
it('preserva o arquivo original e não sobrescreve a v1 ao enviar a v2', async () => {
  await subir()
  const dados = vi.mocked(prisma.arteVersao.create).mock.calls.map(([args]) => args.data)
  expect(dados[0]).toMatchObject({ numero: 1, arquivo: 'original.png' })
  expect(dados[1]).toMatchObject({ numero: 2 })
  expect(dados[1].arquivo).not.toBe('original.png')
})
it('arquivos de duas requisições usam chaves diferentes', async () => {
  await Promise.all([subir(), subir()])
  const keys = vi.mocked(uploadFile).mock.calls.map(([key]) => key)
  expect(new Set(keys).size).toBe(2)
  expect(prisma.$queryRaw).toHaveBeenCalledTimes(2)
})
it('limpa somente o objeto novo se o banco rejeitar a gravação', async () => {
  vi.mocked(prisma.arte.update).mockRejectedValueOnce(new Error('banco indisponível'))
  await expect(subir()).rejects.toThrow('banco indisponível')
  expect(deleteFile).toHaveBeenCalledWith(vi.mocked(uploadFile).mock.calls[0][0])
  expect(deleteFile).not.toHaveBeenCalledWith('original.png')
})
it('restaurar cria uma única versão nova, pendente, com o arquivo escolhido', async () => {
  vi.mocked(prisma.arte.findUnique).mockResolvedValue({ ...atual, versao: 3, status: 'APROVADO' } as any)
  vi.mocked(prisma.arteVersao.findUnique).mockResolvedValue({ id: 'v1', arteId: 'art1', numero: 1, arquivo: 'original.png', tipo: 'image/png', tamanho: 1n } as any)
  await service.restaurarVersao('art1', 'v1', 'd1')
  expect(prisma.arte.update).toHaveBeenCalledWith({ where: { id: 'art1' }, data: expect.objectContaining({ arquivo: 'original.png', versao: 4, status: 'EM_ANALISE' }) })
  expect(prisma.arteVersao.create).toHaveBeenCalledWith({ data: expect.objectContaining({ numero: 4, arquivo: 'original.png' }) })
})
it('não restaura um arquivo de outra arte', async () => {
  vi.mocked(prisma.arteVersao.findUnique).mockResolvedValue({ id: 'v1', arteId: 'outra' } as any)
  await expect(service.restaurarVersao('art1', 'v1', 'd1')).rejects.toThrow('Versão não encontrada')
  expect(prisma.arte.update).not.toHaveBeenCalled()
})
