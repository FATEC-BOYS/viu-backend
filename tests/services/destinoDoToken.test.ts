import { describe, it, expect, vi, beforeEach } from 'vitest'

// `linkService` importa o named export, não o default — os dois precisam
// apontar para o MESMO objeto, senão o teste espia um proxy e o service usa
// outro. Mesma nota que `linkService.test.ts` já carrega.
vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  const mock = criarPrismaMock()
  return { default: mock, prisma: mock }
})
vi.mock('../../src/utils/storage.js', () => ({ signPath: vi.fn(async (k: string) => `assinado:${k}`) }))
vi.mock('../../src/services/licencaService.js', () => ({
  licencaDoProjeto: vi.fn(async () => null),
  licencaPublica: vi.fn(() => null),
}))

import { prisma } from '../../src/database/client.js'
import { LinkService, LinkIndisponivelError } from '../../src/services/linkService.js'

const service = new LinkService()
beforeEach(() => vi.clearAllMocks())

const LINK = {
  id: 'l1',
  token: 't',
  arteId: 'a1',
  tipo: 'ARTE',
  revogado: false,
  expiraEm: null,
  limiteTentativas: null,
  acessos: 0,
  somenteLeitura: false,
}

/**
 * Abrir o link uma vez tem que contar UM acesso.
 *
 * `/l/<token>` — o endereço que vai no WhatsApp — só redireciona para o
 * viewer, e para isso precisa do id da arte. Ele chamava `getPreviewByToken`,
 * que monta a resposta inteira e soma um acesso; o viewer então chamava de
 * novo. Uma abertura do cliente contava DOIS.
 *
 * Isso corrói duas coisas: o número que o designer lê como "quantas vezes ele
 * abriu" — a única prova de que o link chegou do outro lado — e o
 * `limiteTentativas`, que mata o link comparando contra esse mesmo contador, e
 * portanto na metade das aberturas combinadas.
 */
describe('LinkService.destinoDoToken', () => {
  it('devolve o destino sem contar acesso', async () => {
    vi.mocked(prisma.linkCompartilhado.findUnique).mockResolvedValue(LINK as any)

    await expect(service.destinoDoToken('t')).resolves.toEqual({ arteId: 'a1' })
    expect(prisma.linkCompartilhado.update).not.toHaveBeenCalled()
  })

  it('recusa link revogado, com o mesmo motivo do preview', async () => {
    vi.mocked(prisma.linkCompartilhado.findUnique).mockResolvedValue({ ...LINK, revogado: true } as any)

    await expect(service.destinoDoToken('t')).rejects.toMatchObject({ motivo: 'REVOGADO' })
  })

  it('recusa link expirado e leva a data', async () => {
    const ontem = new Date(Date.now() - 86400000)
    vi.mocked(prisma.linkCompartilhado.findUnique).mockResolvedValue({ ...LINK, expiraEm: ontem } as any)

    await expect(service.destinoDoToken('t')).rejects.toMatchObject({ motivo: 'EXPIRADO' })
  })

  it('recusa quando o limite de acessos já foi atingido', async () => {
    vi.mocked(prisma.linkCompartilhado.findUnique).mockResolvedValue(
      { ...LINK, limiteTentativas: 3, acessos: 3 } as any,
    )

    await expect(service.destinoDoToken('t')).rejects.toBeInstanceOf(LinkIndisponivelError)
  })

  it('recusa token inexistente', async () => {
    vi.mocked(prisma.linkCompartilhado.findUnique).mockResolvedValue(null)

    await expect(service.destinoDoToken('t')).rejects.toMatchObject({ motivo: 'NAO_ENCONTRADO' })
  })

  it('deixa passar o link somente-leitura, porque ler é o que se vai fazer', async () => {
    // Diferente de `resolveArteIdFromToken`, que serve ao caminho de comentar
    // e por isso recusa somente-leitura.
    vi.mocked(prisma.linkCompartilhado.findUnique).mockResolvedValue({ ...LINK, somenteLeitura: true } as any)

    await expect(service.destinoDoToken('t')).resolves.toEqual({ arteId: 'a1' })
  })
})
