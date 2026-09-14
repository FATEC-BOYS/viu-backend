import { prisma } from '../database/client.js'
import { signPath } from '../utils/storage.js'
import crypto from 'crypto'
import { licencaDoProjeto, licencaPublica } from './licencaService.js'

/**
 * Por que este link não abre — em código, não em prosa.
 *
 * O controller mapeava a resposta casando pedaços da MENSAGEM em português
 * ("expirado", "revogado", "Limite"). Texto de erro decide comportamento é o
 * mesmo defeito que o portão do contrato teve hoje cedo: mudar uma palavra
 * mudava o código HTTP. Aqui o motivo é o campo.
 */
export type MotivoLinkIndisponivel =
  | 'NAO_ENCONTRADO'
  | 'REVOGADO'
  | 'EXPIRADO'
  | 'LIMITE_ATINGIDO'
  | 'TIPO_NAO_SUPORTADO'

export class LinkIndisponivelError extends Error {
  constructor(
    readonly motivo: MotivoLinkIndisponivel,
    mensagem: string,
    /** Quando expirou — só existe em EXPIRADO, e é o que a tela mostra. */
    readonly expiraEm: Date | null = null,
  ) {
    super(mensagem)
    this.name = 'LinkIndisponivelError'
  }
}

export class LinkService {
  private generateToken(length = 24): string {
    return crypto.randomBytes(length).toString('hex')
  }

  async assertLinkOwnership(id: string, userId: string, isAdmin: boolean) {
    if (isAdmin) return
    const link = await prisma.linkCompartilhado.findUnique({
      where: { id },
      include: { arte: { include: { projeto: { select: { designerId: true, clienteId: true } } } } },
    })
    if (!link) throw new Error('Link não encontrado')
    const projeto = link.arte?.projeto
    if (!projeto || (projeto.designerId !== userId && projeto.clienteId !== userId)) {
      throw new Error('Acesso negado')
    }
  }

  async createSharedLink(data: {
    arteId: string
    expiraEm?: string
    somenteLeitura: boolean
    limiteTentativas?: number
  }, userId: string, isAdmin: boolean) {
    const arte = await prisma.arte.findUnique({
      where: { id: data.arteId },
      include: { projeto: { select: { designerId: true, clienteId: true } } },
    })
    if (!arte) throw new Error('Arte não encontrada')
    if (!isAdmin && arte.projeto.designerId !== userId && arte.projeto.clienteId !== userId) {
      throw new Error('Acesso negado')
    }

    const token = this.generateToken()
    return prisma.linkCompartilhado.create({
      data: {
        token,
        tipo: 'ARTE',
        arteId: data.arteId,
        criadorId: userId,
        expiraEm: data.expiraEm ? new Date(data.expiraEm) : null,
        somenteLeitura: data.somenteLeitura,
        limiteTentativas: data.limiteTentativas ?? null,
      },
    })
  }

  private assertLinkValid(link: {
    revogado: boolean
    expiraEm: Date | null
    limiteTentativas: number | null
    acessos: number
    tipo: string
    arteId: string | null
  }) {
    if (link.revogado) {
      throw new LinkIndisponivelError('REVOGADO', 'Link revogado')
    }
    if (link.expiraEm && new Date(link.expiraEm) < new Date()) {
      throw new LinkIndisponivelError('EXPIRADO', 'Link expirado', new Date(link.expiraEm))
    }
    if (link.limiteTentativas !== null && link.acessos >= link.limiteTentativas) {
      throw new LinkIndisponivelError('LIMITE_ATINGIDO', 'Limite de acessos atingido')
    }
    if (link.tipo !== 'ARTE' || !link.arteId) {
      throw new LinkIndisponivelError('TIPO_NAO_SUPORTADO', 'Tipo de link não suportado')
    }
  }

  async resolveArteIdFromToken(token: string): Promise<string> {
    const link = await prisma.linkCompartilhado.findUnique({ where: { token } })
    if (!link) throw new LinkIndisponivelError('NAO_ENCONTRADO', 'Link inválido')
    this.assertLinkValid(link)
    if (link.somenteLeitura) throw new Error('somenteLeitura')
    return link.arteId!
  }

  async listLinks(userId: string, isAdmin: boolean) {
    const where = isAdmin ? {} : {
      arte: { projeto: { OR: [{ designerId: userId }, { clienteId: userId }] } },
    }
    return prisma.linkCompartilhado.findMany({
      where,
      orderBy: { criadoEm: 'desc' },
      include: {
        arte: {
          select: {
            id: true,
            nome: true,
            // telefone: o designer manda o link de revisão pelo WhatsApp a partir
            // da listagem. Sem ele aqui, redigita o número a cada envio mesmo
            // com o cadastro preenchido. Nome e telefone é o suficiente — o
            // resto do cadastro do cliente não tem o que fazer nesta rota.
            projeto: {
              select: { nome: true, cliente: { select: { nome: true, telefone: true } } },
            },
          },
        },
      },
    })
  }

  async updateLink(id: string, data: { expiraEm?: string | null; somenteLeitura?: boolean; limiteTentativas?: number | null }) {
    const link = await prisma.linkCompartilhado.findUnique({ where: { id } })
    if (!link) throw new Error('Link não encontrado')
    return prisma.linkCompartilhado.update({
      where: { id },
      data: {
        ...(data.somenteLeitura !== undefined && { somenteLeitura: data.somenteLeitura }),
        ...(data.expiraEm !== undefined && { expiraEm: data.expiraEm === null ? null : new Date(data.expiraEm) }),
        ...(data.limiteTentativas !== undefined && { limiteTentativas: data.limiteTentativas }),
      },
    })
  }

  async revokeLink(id: string) {
    const link = await prisma.linkCompartilhado.findUnique({ where: { id } })
    if (!link) throw new Error('Link não encontrado')
    return prisma.linkCompartilhado.update({ where: { id }, data: { revogado: true } })
  }

  async deleteLink(id: string) {
    const link = await prisma.linkCompartilhado.findUnique({ where: { id } })
    if (!link) throw new Error('Link não encontrado')
    await prisma.linkCompartilhado.delete({ where: { id } })
  }

  async getPreviewByToken(token: string) {
    const link = await prisma.linkCompartilhado.findUnique({ where: { token } })
    if (!link) throw new LinkIndisponivelError('NAO_ENCONTRADO', 'Link inválido')

    // O motivo viaja até a tela. Ver `LinkIndisponivelError`.
    this.assertLinkValid(link)

    // Increment access counter (fire-and-forget — counter failure never blocks the response)
    prisma.linkCompartilhado.update({
      where: { token },
      data: { acessos: { increment: 1 } },
    }).catch(() => {})

    const arte = await prisma.arte.findUnique({
      where: { id: link.arteId! },
      include: {
        projeto: { select: { id: true, nome: true } },
        autor: { select: { nome: true } },
      },
    })
    if (!arte) throw new Error('Arte não encontrada')

    const arquivo_url = await signPath(arte.arquivo)

    const feedbacks = await prisma.feedback.findMany({
      where: { arteId: arte.id, publico: true },
      orderBy: { criadoEm: 'desc' },
      include: { autor: { select: { nome: true } } },
    })

    const feedbacksComUrl = await Promise.all(
      feedbacks.map(async (fb: any) => ({
        ...fb,
        arquivo_url: fb.tipo === 'AUDIO' && fb.arquivo ? await signPath(fb.arquivo) : null,
      })),
    )

    // `previewUrl` é o nome que o frontend lê para a imagem da arte — mesma
    // convenção de arteController e aprovacaoController. Esta rota emitia só
    // `arquivo_url`, então o viewer caía no `?? arte.arquivo`, que é a chave
    // crua do bucket e não carrega em `<img>`: a arte aparecia em toda tela
    // logada e quebrava justamente no link público, que é para onde o cliente
    // vai. `arquivo_url` fica porque a tela de feedbacks ainda o consome.
    /*
     * A licença vai junto porque é aqui que ela importa: quem abre o link é
     * quem vai usar a peça, e a cláusula 7.1 diz que o uso só é licenciado
     * depois da quitação. Sem isto, o cliente baixa a arte sem nada informando
     * que ela ainda não é dele — e descobre depois, na discussão.
     */
    /*
     * Reduzida antes de sair: esta rota é o link público, e o link é
     * encaminhado. `licencaPublica` responde "dá para usar esta peça?" sem
     * contar a data da quitação nem que houve estorno — ver o porquê em
     * `licencaService`.
     */
    const licenca = licencaPublica(await licencaDoProjeto(arte.projetoId))

    return {
      somenteLeitura: link.somenteLeitura,
      acessos: link.acessos + 1,
      arte: { ...arte, arquivo_url, previewUrl: arquivo_url },
      licenca,
      feedbacks: feedbacksComUrl,
    }
  }
}
