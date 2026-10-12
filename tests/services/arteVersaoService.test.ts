import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  return { default: criarPrismaMock() }
})
vi.mock('../../src/utils/storage.js', () => ({
  uploadFile: vi.fn().mockResolvedValue(undefined),
  signPath: vi.fn().mockResolvedValue('url'),
}))

import prisma from '../../src/database/client.js'
import { ArteVersaoService } from '../../src/services/arteVersaoService.js'

const service = new ArteVersaoService()
beforeEach(() => vi.clearAllMocks())

const subir = () =>
  service.criarVersao({
    arteId: 'art1',
    buffer: Buffer.from('x'),
    filename: 'capa.png',
    mimetype: 'image/png',
    size: 1,
    criadoPorId: 'd1',
  } as any)

/** O `update` da arte dentro da transação — o segundo item do `$transaction`. */
function dadosDaArte() {
  const [chamadas] = vi.mocked(prisma.$transaction).mock.calls as any[]
  return vi.mocked(prisma.arte.update).mock.calls.at(-1)?.[0]?.data ?? chamadas
}

describe('criarVersao', () => {
  /*
   * `ARTE_TRANSITIONS` diz `REJEITADO: ['EM_ANALISE']` — mandar outra versão É
   * o caminho de volta, e era o único. Só que ninguém o conduzia: a versão
   * subia e o status ficava onde estava.
   *
   * Enquanto a recusa do cliente não mexia no status da arte isso não
   * aparecia. Com a decisão movendo o rótulo, a arte recusada travaria: o
   * cliente aprovaria a v2 e `REJEITADO → APROVADO` não existe na máquina, de
   * modo que a tela continuaria dizendo "Recusada" para sempre.
   */
  it('versão nova reabre a arte recusada', async () => {
    vi.mocked(prisma.arte.findUnique).mockResolvedValue({ id: 'art1', versao: 1, status: 'REJEITADO' } as any)
    vi.mocked(prisma.arteVersao.create).mockResolvedValue({ id: 'v2' } as any)
    vi.mocked(prisma.arte.update).mockResolvedValue({ id: 'art1' } as any)

    await subir()

    expect(dadosDaArte().status).toBe('EM_ANALISE')
  })

  /* `APROVADO` é terminal de propósito; `EM_ANALISE` já é o que queremos. */
  it('não mexe no status quando a arte não estava recusada', async () => {
    vi.mocked(prisma.arte.findUnique).mockResolvedValue({ id: 'art1', versao: 1, status: 'EM_ANALISE' } as any)
    vi.mocked(prisma.arteVersao.create).mockResolvedValue({ id: 'v2' } as any)
    vi.mocked(prisma.arte.update).mockResolvedValue({ id: 'art1' } as any)

    await subir()

    expect(dadosDaArte()).not.toHaveProperty('status')
  })

  it('avança o número da versão de qualquer jeito', async () => {
    vi.mocked(prisma.arte.findUnique).mockResolvedValue({ id: 'art1', versao: 3, status: 'EM_ANALISE' } as any)
    vi.mocked(prisma.arteVersao.create).mockResolvedValue({ id: 'v4' } as any)
    vi.mocked(prisma.arte.update).mockResolvedValue({ id: 'art1' } as any)

    await subir()

    expect(dadosDaArte().versao).toBe(4)
  })
})
