import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '@prisma/client'
// Apenas o armazenamento externo é substituído; contador, snapshots e transações usam PostgreSQL.
vi.mock('../../src/utils/storage.js', () => ({ uploadFile: vi.fn(async (key: string) => key), deleteFile: vi.fn(), signPath: vi.fn() }))
import { ArteVersaoService } from '../../src/services/arteVersaoService.js'
const db = new PrismaClient()
const service = new ArteVersaoService()
const designer = 'cdb-versoes-designer-01'
const cliente = 'cdb-versoes-cliente-001'
const projeto = 'cdb-versoes-projeto-001'
const arteId = 'cdb-versoes-arte-000001'
beforeAll(async () => {
  await db.usuario.createMany({ data: [
    { id: designer, nome: 'Designer Versões', email: 'designer-versoes@test.com', tipo: 'DESIGNER' },
    { id: cliente, nome: 'Cliente Versões', email: 'cliente-versoes@test.com', tipo: 'CLIENTE' },
  ], skipDuplicates: true })
  await db.projeto.upsert({ where: { id: projeto }, update: {}, create: { id: projeto, nome: 'Versões', designerId: designer, clienteId: cliente } })
})
beforeEach(async () => {
  await db.arte.deleteMany({ where: { id: arteId } })
  await db.arte.create({ data: { id: arteId, projetoId: projeto, autorId: designer, nome: 'Capa', arquivo: 'capa-original.png', tipo: 'image/png', tamanho: 1n, status: 'APROVADO' } })
  await db.aprovacao.create({ data: { arteId, aprovadorId: cliente, status: 'APROVADO', versaoNumero: 1, decididoEm: new Date() } })
})
afterAll(async () => {
  await db.projeto.deleteMany({ where: { id: projeto } })
  await db.usuario.deleteMany({ where: { id: { in: [designer, cliente] } } })
  await db.$disconnect()
})
const subir = (texto: string) => service.criarVersao({ arteId, criadoPorId: designer, buffer: Buffer.from(texto), filename: 'capa.png', mimetype: 'image/png', size: texto.length })
describe('histórico e concorrência das entregas', () => {
  it('dois uploads simultâneos recebem v2 e v3, sem perder a v1 ou seu aceite', async () => {
    const entregas = await Promise.all([subir('A'), subir('B')])
    expect(entregas.map(v => v.numero).sort()).toEqual([2, 3])
    expect(new Set(entregas.map(v => v.arquivo)).size).toBe(2)
    const snapshots = await db.arteVersao.findMany({ where: { arteId }, orderBy: { numero: 'asc' } })
    expect(snapshots.map(v => v.numero)).toEqual([1, 2, 3])
    expect(snapshots[0].arquivo).toBe('capa-original.png')
    const atual = await db.arte.findUniqueOrThrow({ where: { id: arteId } })
    expect(atual).toMatchObject({ versao: 3, status: 'EM_ANALISE', arquivo: snapshots[2].arquivo })
    expect(await db.aprovacao.count({ where: { arteId, versaoNumero: 1, status: 'APROVADO' } })).toBe(1)
  })
  it('restaurar uma versão aprovada abre nova revisão e cria o snapshot correto', async () => {
    await subir('nova')
    const v1 = await db.arteVersao.findFirstOrThrow({ where: { arteId, numero: 1 } })
    const restaurada = await service.restaurarVersao(arteId, v1.id, designer)
    expect(restaurada).toMatchObject({ versao: 3, status: 'EM_ANALISE', arquivo: 'capa-original.png' })
    expect(await db.arteVersao.findFirst({ where: { arteId, numero: 3 } })).toMatchObject({ arquivo: 'capa-original.png' })
  })
})
