import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  const mock = criarPrismaMock()
  return { default: mock, prisma: mock }
})

import prisma from '../../src/database/client.js'
import { LinkService, LinkIndisponivelError } from '../../src/services/linkService.js'

const db = prisma as any
const service = new LinkService()

function link(extra: Record<string, unknown> = {}) {
  return {
    id: 'l1',
    token: 'tok',
    tipo: 'ARTE',
    arteId: 'ca1',
    revogado: false,
    expiraEm: null,
    limiteTentativas: null,
    acessos: 0,
    somenteLeitura: false,
    ...extra,
  }
}

beforeEach(() => vi.clearAllMocks())

/**
 * O serviço sabia exatamente por que o link não abria — revogado, expirado,
 * limite — e o controller jogava os quatro num 404 "Link não encontrado". O
 * cliente abria no celular, via página em branco e voltava para o WhatsApp
 * dizendo "não abriu", sem o designer saber qual dos casos tinha sido.
 *
 * O motivo agora é CAMPO, não pedaço de frase em português: o controller casava
 * "expirado"/"revogado"/"Limite" na mensagem, e mudar uma palavra mudava o
 * código HTTP — o mesmo defeito do portão do contrato.
 */
async function motivoDe(l: Record<string, unknown>) {
  db.linkCompartilhado.findUnique.mockResolvedValue(link(l))
  const erro: any = await service.getPreviewByToken('tok').catch((e) => e)
  return erro
}

describe('por que o link não abre', () => {
  it('revogado se diz revogado', async () => {
    const e = await motivoDe({ revogado: true })
    expect(e).toBeInstanceOf(LinkIndisponivelError)
    expect(e.motivo).toBe('REVOGADO')
  })

  it('expirado se diz expirado — e carrega a data', async () => {
    // Sem a data a tela só consegue dizer "expirou"; com ela, "expirou em
    // 12/09", que é o que deixa a pessoa pedir um novo sem parecer perdida.
    const quando = new Date('2026-09-12T10:00:00.000Z')
    const e = await motivoDe({ expiraEm: quando })
    expect(e.motivo).toBe('EXPIRADO')
    expect(e.expiraEm?.toISOString()).toBe(quando.toISOString())
  })

  it('limite atingido é caso próprio, não "não encontrado"', async () => {
    const e = await motivoDe({ limiteTentativas: 3, acessos: 3 })
    expect(e.motivo).toBe('LIMITE_ATINGIDO')
  })

  it('token que nunca existiu continua sendo NAO_ENCONTRADO', async () => {
    db.linkCompartilhado.findUnique.mockResolvedValue(null)
    const e: any = await service.getPreviewByToken('tok').catch((x) => x)
    expect(e.motivo).toBe('NAO_ENCONTRADO')
  })

  it('revogado tem precedência sobre expirado — o designer agiu', async () => {
    const e = await motivoDe({ revogado: true, expiraEm: new Date('2020-01-01') })
    expect(e.motivo).toBe('REVOGADO')
  })

  it('link válido não levanta nada', async () => {
    db.linkCompartilhado.findUnique.mockResolvedValue(link())
    db.arte.findUnique.mockResolvedValue(null)
    const e: any = await service.getPreviewByToken('tok').catch((x) => x)
    expect(e).not.toBeInstanceOf(LinkIndisponivelError)
  })

  it('o motivo é campo, não pedaço da mensagem', async () => {
    /*
     * Trava o acoplamento que existia: a resposta HTTP saía de casar palavras
     * em português no texto do erro. Melhorar uma frase mudava o status.
     */
    const e = await motivoDe({ revogado: true })
    expect(e.motivo).toBe('REVOGADO')
    e.message = 'qualquer outra redação'
    expect(e.motivo).toBe('REVOGADO')
  })
})
