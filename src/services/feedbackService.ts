import { lerRascunho, RascunhoAudioError } from './audioRascunhoService.js'
import prisma from '../database/client.js'
import { uploadFile, lerArquivo } from '../utils/storage.js'
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
          /*
           * Quantas respostas a thread tem.
           *
           * A listagem devolve só as raízes, então quem desenha o cartão não
           * tinha como saber se alguém já respondeu — e a tela de Feedbacks
           * carimbava "Aguardando resposta" em tudo que não estivesse
           * resolvido, inclusive nas conversas que ela mesma mostrava
           * respondidas no painel ao lado.
           *
           * `_count` sai na mesma consulta e `parentId` é indexado, então é
           * barato: nenhuma viagem a mais ao banco.
           */
          _count: { select: { respostas: true } },
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
        select: {
          id: true,
          nome: true,
          autorId: true,
          // Para carimbar `versaoNumero` — ver o comentário no `create`.
          versao: true,
          projeto: { select: { designerId: true, clienteId: true } },
        },
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
    /*
     * A versão é carimbada pelo servidor, a partir da arte, e não aceita do
     * corpo da requisição.
     *
     * Este campo alimenta a contagem de rodadas da cláusula 3.2, que é
     * argumento em disputa — e um número que a outra parte escolhe não serve
     * de prova contra ela. O que vale é o que a arte era quando o comentário
     * chegou.
     *
     * O carimbo vem DEPOIS do spread justamente por isso: um `versaoNumero`
     * que viesse no corpo da requisição seria sobrescrito aqui.
     */
    const feedback = await prisma.feedback.create({
      data: { ...data, versaoNumero: arte.versao },
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
        { entidadeTipo: 'ARTE', entidadeId: arte.id },
      )
    }

    return feedback
  }

  /**
   * O comentário em áudio — e a transcrição como enfeite, não como condição.
   *
   * A ordem aqui era: sobe o arquivo, TRANSCREVE, cria a linha. Com a
   * transcrição no caminho crítico, qualquer tropeço da OpenAI (chave
   * ausente, cota estourada, serviço fora) derrubava o comentário inteiro: a
   * linha nunca era criada, o cliente lia "Não foi possível enviar o áudio" —
   * e o arquivo, que já tinha subido na linha anterior, ficava órfão no
   * bucket.
   *
   * Isso invertia a importância das duas coisas. A gravação é o comentário; a
   * transcrição é uma conveniência para quem prefere ler. Agora a linha nasce
   * com o áudio, e o texto chega se chegar — `conteudo` vazio e `transcricao`
   * nula são a resposta honesta para "ainda não transcrevi", e a tela diz
   * "Áudio sem transcrição" em vez de inventar.
   *
   * `GET /feedbacks/:id/transcricao` é o caminho para transcrever depois o
   * que entrou sem texto.
   */
  async createFeedbackComAudio(params: {
    arteId: string
    autorId: string
    audioBuffer: Buffer
    revisado?: boolean
    conteudoRevisado?: string
    recibo?: string
    versaoEsperada?: number
    filename: string
    /**
     * O tipo real do arquivo, como o middleware o leu.
     *
     * Era fixo em `'audio/webm'`, o que só era verdade no Chrome e no
     * Firefox: o Safari grava em `audio/mp4`. Gravar o objeto no bucket com o
     * tipo errado faz o navegador receber um `Content-Type` que não combina
     * com os bytes — e aí o player ou recusa ou fica muda sem dizer por quê.
     */
    mimetype?: string
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

    let transcricaoOriginal: string | null = null
    let conteudoRevisado = ''
    if (params.revisado) {
      if (params.versaoEsperada !== arte.versao) throw new RascunhoAudioError('A versão da arte mudou. Reabra a versão atual para comentar.')
      if (params.conteudoRevisado !== undefined && typeof params.conteudoRevisado !== 'string') throw new RascunhoAudioError('O comentário deve ser um texto.')
      conteudoRevisado = params.conteudoRevisado?.trim() ?? ''
      if (conteudoRevisado.length > 10000) throw new RascunhoAudioError('O comentário deve ter no máximo 10.000 caracteres.')
      if (params.recibo && !conteudoRevisado) throw new RascunhoAudioError('Confira o texto do comentário antes de enviar.')
      if (params.recibo) transcricaoOriginal = lerRascunho(params.recibo, { arteId, autorId, versao: arte.versao, audioBuffer })
    }

    const storagePath = `feedbacks/${arteId}/${Date.now()}_${filename}`
    await uploadFile(storagePath, audioBuffer, params.mimetype ?? 'audio/webm')

    const comAutor = {
      autor: { select: { id: true, nome: true, avatar: true } },
      arte: { select: { id: true, nome: true } },
    }

    let feedback = await prisma.feedback.create({
      data: {
        // Vazio, e não um texto de enfeite: é o que a tela precisa poder
        // distinguir para oferecer "transcrever" em vez de fingir que leu.
        conteudo: conteudoRevisado,
        ...(params.revisado ? { transcricao: transcricaoOriginal } : {}),
        /*
         * `AUDIO` sempre — o rótulo diz o MEIO, e a posição já mora em
         * `posicaoX`/`posicaoY`.
         *
         * Aqui gravava-se `POSICIONAL` quando a gravação vinha com um pino, o
         * que misturava duas coisas independentes e fazia o produto mentir
         * sobre si mesmo: toda leitura que perguntava `tipo === 'AUDIO'`
         * respondia "não é áudio" justamente para o comentário em áudio mais
         * específico que existe. Medido no link público: nenhum player era
         * desenhado para ele.
         */
        tipo: 'AUDIO',
        arquivo: storagePath,
        posicaoX: posicaoX ?? null,
        posicaoY: posicaoY ?? null,
        arteId,
        autorId,
        // Mesmo carimbo do fluxo de texto: comentário em áudio conta rodada
        // igual, e sem isto a contagem ficaria pela metade.
        versaoNumero: arte.versao,
      },
      include: comAutor,
    })

    /*
     * A transcrição vem depois da linha existir, e falhar aqui não desfaz
     * nada: o comentário em áudio continua de pé, tocável, só sem texto.
     */
    if (!params.revisado) try {
      const transcricao = await transcreverAudio(audioBuffer, filename, params.mimetype)
      feedback = await prisma.feedback.update({
        where: { id: feedback.id },
        data: { conteudo: transcricao, transcricao },
        include: comAutor,
      })
    } catch (erro) {
      // A gravação está no ar; o texto não. Fica registrado porque é a
      // diferença entre "a OpenAI está fora" e "ninguém transcreveu ainda".
      console.warn(
        `[feedback] áudio salvo sem transcrição (feedback=${feedback.id}):`,
        erro instanceof Error ? erro.message : erro,
      )
    }

    /*
     * Avisar a outra parte, exatamente como o fluxo de texto avisa.
     *
     * O fluxo de áudio não avisava ninguém. O cliente gravava o recado, ele
     * entrava no banco, e o designer não ficava sabendo — a não ser que
     * entrasse na arte por conta própria e rolasse a lista. O recado em áudio
     * é justamente o que o cliente manda quando tem pressa de ser ouvido.
     */
    const proj = arte.projeto
    const destinatarioId = autorId === proj.designerId ? proj.clienteId : proj.designerId
    if (destinatarioId && destinatarioId !== autorId) {
      notificacaoService.dispatch(
        destinatarioId,
        'NOVO_FEEDBACK',
        `Novo feedback em "${arte.nome}"`,
        `${autor.nome} deixou um comentário em áudio na arte "${arte.nome}".`,
        { entidadeTipo: 'ARTE', entidadeId: arte.id },
      )
    }

    return feedback
  }

  async gerarAudioDoFeedback(id: string): Promise<{ buffer: Buffer; feedback: any }> {
    const feedback = await prisma.feedback.findUnique({ where: { id } })
    if (!feedback) throw new Error('Feedback não encontrado')
    if (!feedback.conteudo || feedback.conteudo.trim().length === 0) {
      throw new Error('Feedback não possui conteúdo textual para sintetizar')
    }

    /*
     * A cópia já sintetizada, lida do bucket pela CHAVE.
     *
     * Aqui estava `fetch(feedback.audioGerado)`, e `audioGerado` guarda a
     * chave do R2 — não uma URL. O `fetch` nunca tinha endereço para onde ir,
     * lançava, caía no `catch` e sintetizava de novo: o cache não acertava
     * NUNCA. Cada clique em "ouvir" era uma cobrança nova na conta da OpenAI
     * pelo mesmo comentário, e a coluna `audioGerado` existia sem servir para
     * nada.
     */
    if (feedback.audioGerado) {
      const guardado = await lerArquivo(feedback.audioGerado)
      if (guardado) return { buffer: guardado, feedback }
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

    /*
     * Mesma confusão chave/URL de `gerarAudioDoFeedback`, e aqui ela custava
     * mais: este é o caminho para transcrever DEPOIS um áudio que entrou sem
     * texto — exatamente o que passa a acontecer quando a OpenAI falha na
     * hora do envio. Com um `fetch` numa chave de bucket, esse caminho nunca
     * chegou a funcionar.
     */
    const audioBuffer = await lerArquivo(feedback.arquivo)
    if (!audioBuffer) throw new Error('Erro ao buscar arquivo de áudio')
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
