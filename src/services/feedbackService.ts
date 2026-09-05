import prisma from '../database/client.js'
import { uploadFile } from '../utils/storage.js'
import { PROJETO_ACCESS_SELECT, assertAcessoAoProjeto } from '../utils/projectAccess.js'
import { transcreverAudio, sintetizarTexto } from './transcricaoService.js'
import { notificacaoService } from './notificacaoService.js'

export interface ListFeedbacksParams {
  page?: number
  limit?: number
  arteId?: string
  autorId?: string
  tipo?: string
  status?: string
  search?: string
  projetoIds?: string[] // access-control scope (set by controller for non-admins)
}

/**
 * De onde vem a autorização para criar o feedback.
 *
 * Há duas portas de entrada com modelos de acesso diferentes, e tratá-las
 * igual quebra uma das duas:
 *   - `projeto`: API direta. Quem escreve tem que ser designer ou cliente do
 *     projeto da arte.
 *   - `link`: link compartilhado. Quem escreve é um revisor externo que não
 *     participa do projeto — a autorização foi o token, já validado em
 *     LinkService (não revogado, não expirado, dentro do limite de acessos,
 *     e não somenteLeitura).
 *
 * O padrão é `projeto`: esquecer o parâmetro nega, nunca libera.
 */
export type OrigemFeedback =
  | { via: 'projeto'; isAdmin?: boolean }
  | { via: 'link' }

export class FeedbackService {
  async listFeedbacks({ page = 1, limit = 10, arteId, autorId, tipo, status, search, projetoIds }: ListFeedbacksParams) {
    const skip = (page - 1) * limit
    const and: any[] = []
    // Só as raízes: resposta de thread aparece dentro do feedback pai, não
    // como item solto na listagem (nem no contador).
    and.push({ parentId: null })
    if (arteId) and.push({ arteId })
    if (autorId) and.push({ autorId })
    if (tipo) and.push({ tipo })
    // Feedback não tem coluna `status` — o estado da thread vive em `resolvidoEm`.
    // Repassar `status` direto para o Prisma lançava "Unknown argument status" (500).
    if (status === 'ABERTO') and.push({ resolvidoEm: null })
    else if (status === 'RESOLVIDO') and.push({ resolvidoEm: { not: null } })
    if (projetoIds) and.push({ arte: { projetoId: { in: projetoIds } } })
    if (search) {
      and.push({
        OR: [
          { conteudo: { contains: search, mode: 'insensitive' } },
          { arte: { nome: { contains: search, mode: 'insensitive' } } },
        ],
      })
    }
    const where = and.length > 0 ? { AND: and } : {}
    const [feedbacks, total] = await Promise.all([
      prisma.feedback.findMany({
        where,
        skip,
        take: Number(limit),
        include: {
          autor: { select: { id: true, nome: true, tipo: true } },
          arte: {
            select: {
              id: true,
              nome: true,
              status: true,
              arquivo: true,
              projeto: {
                select: {
                  id: true,
                  nome: true,
                  cliente: { select: { id: true, nome: true } },
                },
              },
            },
          },
        },
        orderBy: { criadoEm: 'desc' },
      }),
      prisma.feedback.count({ where }),
    ])
    return { feedbacks, total }
  }

  async getFeedbackById(id: string) {
    return prisma.feedback.findUnique({
      where: { id },
      include: {
        autor: { select: { id: true, nome: true, avatar: true } },
        arte: { select: { id: true, nome: true } },
        // A tela abre um feedback para ler a conversa; sem isto a thread
        // criada via parentId ficava invisível.
        respostas: {
          include: { autor: { select: { id: true, nome: true, avatar: true } } },
          orderBy: { criadoEm: "asc" },
        },
      },
    })
  }

  async createFeedback(data: any, origem: OrigemFeedback = { via: 'projeto' }) {
    const [arte, autor] = await Promise.all([
      prisma.arte.findUnique({
        where: { id: data.arteId },
        select: { id: true, nome: true, autorId: true, projeto: { select: { designerId: true, clienteId: true } } },
      }),
      prisma.usuario.findUnique({ where: { id: data.autorId }, select: { id: true, nome: true } }),
    ])
    if (!arte) throw new Error('Arte não encontrada')
    if (!autor) throw new Error('Autor não encontrado')

    // Sem isto, a única barreira era o middleware da rota — e ele aceitava um
    // `projetoId` qualquer no corpo, o que permitia despejar feedback em arte
    // de outro tenant.
    if (origem.via === 'projeto') {
      assertAcessoAoProjeto(arte.projeto, data.autorId, origem.isAdmin === true)
    }

    // Validate thread: parent must belong to the same arte
    if (data.parentId) {
      const parent = await prisma.feedback.findUnique({ where: { id: data.parentId }, select: { arteId: true } })
      if (!parent || parent.arteId !== data.arteId) {
        throw new Error('Feedback pai não encontrado ou pertence a outra arte')
      }
    }

    // Com autor incluído: quem cria (inclusive resposta em thread) recebe o
    // mesmo formato que a listagem devolve, e a UI pode inserir direto.
    const feedback = await prisma.feedback.create({
      data,
      include: { autor: { select: { id: true, nome: true, avatar: true } } },
    })

    // Notify the other party: if autor is the designer, notify the client (and vice-versa)
    const proj = arte.projeto
    const recipientId = data.autorId === proj.designerId ? proj.clienteId : proj.designerId
    if (recipientId && recipientId !== data.autorId) {
      const threadLabel = data.parentId ? 'respondeu a um comentário' : 'adicionou um feedback'
      notificacaoService.dispatch(
        recipientId,
        'NOVO_FEEDBACK',
        `Novo feedback em "${arte.nome}"`,
        `${autor.nome} ${threadLabel} na arte "${arte.nome}".`,
      )
    }

    return feedback
  }

  async createFeedbackComAudio(params: {
    arteId: string
    autorId: string
    audioBuffer: Buffer
    filename: string
    posicaoX?: number
    posicaoY?: number
    origem?: OrigemFeedback
  }) {
    const { arteId, autorId, audioBuffer, filename, posicaoX, posicaoY } = params
    const origem = params.origem ?? { via: 'projeto' }

    const [arte, autor] = await Promise.all([
      prisma.arte.findUnique({
        where: { id: arteId },
        include: { projeto: { select: PROJETO_ACCESS_SELECT } },
      }),
      prisma.usuario.findUnique({ where: { id: autorId } }),
    ])
    if (!arte) throw new Error('Arte não encontrada')
    if (!autor) throw new Error('Autor não encontrado')

    // Mesma regra do fluxo de texto — ver OrigemFeedback.
    if (origem.via === 'projeto') {
      assertAcessoAoProjeto(arte.projeto, autorId, origem.isAdmin === true)
    }

    const storagePath = `feedbacks/${arteId}/${Date.now()}_${filename}`
    await uploadFile(storagePath, audioBuffer, 'audio/webm')

    const transcricao = await transcreverAudio(audioBuffer, filename)
    const tipo = posicaoX !== undefined && posicaoY !== undefined ? 'POSICIONAL' : 'AUDIO'

    return prisma.feedback.create({
      data: {
        conteudo: transcricao,
        tipo,
        arquivo: storagePath,
        transcricao,
        posicaoX: posicaoX ?? null,
        posicaoY: posicaoY ?? null,
        arteId,
        autorId,
      },
      include: {
        autor: { select: { id: true, nome: true, avatar: true } },
        arte: { select: { id: true, nome: true } },
      },
    })
  }

  async gerarAudioDoFeedback(id: string): Promise<{ buffer: Buffer; feedback: any }> {
    const feedback = await prisma.feedback.findUnique({ where: { id } })
    if (!feedback) throw new Error('Feedback não encontrado')
    if (!feedback.conteudo || feedback.conteudo.trim().length === 0) {
      throw new Error('Feedback não possui conteúdo textual para sintetizar')
    }

    if (feedback.audioGerado) {
      try {
        const response = await fetch(feedback.audioGerado)
        if (response.ok) {
          return { buffer: Buffer.from(await response.arrayBuffer()), feedback }
        }
      } catch {
        // cache miss — regenera
      }
    }

    const audioBuffer = await sintetizarTexto(feedback.conteudo)
    const storagePath = `feedbacks-tts/${id}/${Date.now()}.mp3`

    try {
      await uploadFile(storagePath, audioBuffer, 'audio/mpeg')
      await prisma.feedback.update({ where: { id }, data: { audioGerado: storagePath } })
    } catch {
      // falha no upload não bloqueia a resposta
    }

    return { buffer: audioBuffer, feedback }
  }

  async getTranscricao(id: string): Promise<string> {
    const feedback = await prisma.feedback.findUnique({ where: { id } })
    if (!feedback) throw new Error('Feedback não encontrado')
    if (feedback.transcricao) return feedback.transcricao
    if (!feedback.arquivo) throw new Error('Feedback não possui áudio para transcrever')

    const response = await fetch(feedback.arquivo)
    if (!response.ok) throw new Error('Erro ao buscar arquivo de áudio')
    const audioBuffer = Buffer.from(await response.arrayBuffer())
    const transcricao = await transcreverAudio(audioBuffer)

    await prisma.feedback.update({ where: { id }, data: { transcricao } })
    return transcricao
  }

  async updateFeedback(id: string, updateData: any) {
    const existing = await prisma.feedback.findUnique({ where: { id } })
    if (!existing) throw new Error('Feedback não encontrado')
    return prisma.feedback.update({ where: { id }, data: updateData })
  }

  async deleteFeedback(id: string) {
    const existing = await prisma.feedback.findUnique({ where: { id } })
    if (!existing) throw new Error('Feedback não encontrado')
    await prisma.feedback.delete({ where: { id } })
  }

  async resolverThread(id: string, resolvidoPorId: string, isAdmin = false) {
    const feedback = await prisma.feedback.findUnique({
      where: { id },
      include: { arte: { select: { projeto: { select: PROJETO_ACCESS_SELECT } } } },
    })
    if (!feedback) throw new Error('Feedback não encontrado')
    assertAcessoAoProjeto(feedback.arte?.projeto, resolvidoPorId, isAdmin)

    if (feedback.resolvidoEm) throw new Error('Thread já está resolvida')
    return prisma.feedback.update({
      where: { id },
      data: { resolvidoEm: new Date(), resolvidoPor: resolvidoPorId },
    })
  }

  async reabrirThread(id: string, requesterId: string, isAdmin = false) {
    const feedback = await prisma.feedback.findUnique({
      where: { id },
      include: { arte: { select: { projeto: { select: PROJETO_ACCESS_SELECT } } } },
    })
    if (!feedback) throw new Error('Feedback não encontrado')
    assertAcessoAoProjeto(feedback.arte?.projeto, requesterId, isAdmin)

    if (!feedback.resolvidoEm) throw new Error('Thread não está resolvida')
    return prisma.feedback.update({
      where: { id },
      data: { resolvidoEm: null, resolvidoPor: null },
    })
  }
}
