import { FastifyRequest, FastifyReply } from 'fastify'
import { ArteService, ListArtesParams } from '../services/arteService.js'
import { NotificacaoService } from '../services/notificacaoService.js'
import { uploadFile, signPath, deleteFile } from '../utils/storage.js'
import { getAccessibleProjectIds } from '../utils/projectAccess.js'
import { novoId } from '../utils/ids.js'
import prisma from '../database/client.js'
import { erroInterno } from '../utils/erroInterno.js'
import { licencaDoProjeto } from '../services/licencaService.js'
import { rodadasDaArte } from '../services/rodadasService.js'

const arteService = new ArteService()
const notificacaoService = new NotificacaoService()

export async function listArtes(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { page = 1, limit = 10, projetoId, autorId, clienteId, status, tipo, search, orderBy } =
      (request.query || {}) as any
    const params: ListArtesParams = {
      page: Number(page) || 1,
      limit: Number(limit) || 10,
      projetoId: projetoId as string | undefined,
      autorId: autorId as string | undefined,
      clienteId: clienteId as string | undefined,
      status: status as string | undefined,
      tipo: tipo as string | undefined,
      search: search as string | undefined,
      orderBy: orderBy as ListArtesParams['orderBy'],
    }

    const acessiveis = await getAccessibleProjectIds(usuario.id, usuario.tipo === 'ADMIN')
    if (acessiveis) {
      // 403 explícito em vez de lista vazia: pedir um projeto que não é seu é
      // erro de autorização, não resultado sem itens.
      if (params.projetoId && !acessiveis.includes(params.projetoId)) {
        reply.status(403).send({ message: 'Acesso negado', success: false })
        return
      }
      params.projetoIds = acessiveis
    }

    const { artes, total, porStatus } = await arteService.listArtes(params)
    /**
     * A lista devolvia só `arquivo`, que é a chave do bucket — e a grade de
     * artes ficava com o ícone de imagem quebrada, porque chave crua no `src`
     * de um `<img>` não carrega nada. Assinar aqui é o que a torna exibível.
     *
     * O nome do campo é `previewUrl` porque é o que a resposta do upload já
     * devolve e o que o frontend lê. O detalhe da arte chamava a mesma coisa
     * de `arquivo_url` e as versões de `arquivoUrl`: três nomes para o mesmo
     * dado foi como a leitura ficou para trás sem ninguém notar.
     */
    const artesComPreview = await Promise.all(
      artes.map(async (arte: any) => ({
        ...arte,
        previewUrl: await signPath(arte.arquivo),
      })),
    )
    reply.send({
      data: artesComPreview,
      pagination: { page: params.page, limit: params.limit, total, pages: Math.ceil(total / params.limit!) },
      porStatus,
      success: true,
    })
  } catch (erro) {
    request.log.error({ err: erro }, 'Erro ao listar artes')
    reply.status(500).send({ message: 'Erro ao listar artes', success: false })
  }
}

/**
 * Os valores por que dá para filtrar a listagem — projetos, clientes, autores
 * e tipos dentro do que esta pessoa alcança.
 *
 * Endpoint próprio, e não um bloco na resposta de `/artes`: as facetas não
 * mudam a cada troca de filtro nem a cada página, então recalculá-las em toda
 * listagem seria pagar quatro consultas por rolagem para devolver sempre a
 * mesma coisa.
 */
export async function facetasDeArtes(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const acessiveis = await getAccessibleProjectIds(usuario.id, usuario.tipo === 'ADMIN')
    const facetas = await arteService.facetasDeArtes({ projetoIds: acessiveis ?? undefined })
    reply.send({ data: facetas, success: true })
  } catch (erro) {
    request.log.error({ err: erro }, 'Erro ao listar facetas de artes')
    reply.status(500).send({ message: 'Erro ao listar filtros de artes', success: false })
  }
}

export async function getArteById(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const { id } = request.params as { id: string }
    const arte = await arteService.getArteById(id)
    if (!arte) {
      reply.status(404).send({ message: 'Arte não encontrada', success: false })
      return
    }

    /*
     * Aqui havia um 402 para cliente com fatura PENDENTE. Saiu por três
     * motivos, em ordem de peso:
     *
     *  - barrava o detalhe inteiro, não o "download" que o comentário anunciava:
     *    preview e feedbacks iam junto, então o cliente não conseguia nem ver o
     *    trabalho para decidir pagar;
     *  - `getPreviewByToken` nunca teve a checagem, então o mesmo cliente via
     *    tudo pelo link que o designer mandou. O bloqueio não retinha nada —
     *    só piorava a experiência de quem entrava pela porta da frente;
     *  - era punição sem aviso: a pessoa clicava e levava erro, sem nada antes
     *    dizendo que faltava pagar.
     *
     * No lugar entra informação: `licenca`, logo abaixo, diz na própria peça se
     * o uso está licenciado (cláusula 7.1 do anexo). Reter o arquivo final é
     * outra conversa, e fica para quando for decidida — reter a visualização
     * nunca foi o mesmo que reter a entrega.
     */
    const arquivo_url = await signPath(arte.arquivo)
    const feedbacksComUrl = await Promise.all(
      (arte.feedbacks || []).map(async (fb: any) => ({
        ...fb,
        arquivo_url: fb.tipo === 'AUDIO' && fb.arquivo ? await signPath(fb.arquivo) : null,
      })),
    )
    // `previewUrl` é o nome que o frontend lê; `arquivo_url` fica porque a
    // tela de feedbacks ainda o consome para o áudio.
    /*
     * A licença de uso, vinda das faturas do projeto — cláusula 7.1 do anexo.
     * A peça carrega o próprio estado: quem for usá-la vê se pode, em vez de
     * descobrir na discussão depois.
     */
    const licenca = await licencaDoProjeto(arte.projetoId)

    /*
     * As rodadas usadas nesta peça — cláusula 3.2. Vai junto da arte porque é
     * na peça que a conta se resolve: "2 de 3" é sobre esta entrega, não sobre
     * o projeto somado (3.1).
     *
     * Não sai no link público de propósito: quantas revisões o cliente pediu é
     * assunto das partes, pelo mesmo motivo que a data de quitação saiu de lá.
     */
    const rodadas = await rodadasDaArte(arte.id)

    reply.send({
      data: {
        ...arte,
        arquivo_url,
        previewUrl: arquivo_url,
        licenca,
        rodadas,
        feedbacks: feedbacksComUrl,
      },
      success: true,
    })
  } catch (erro) {
    request.log.error({ err: erro }, 'Erro ao buscar arte')
    reply.status(500).send({ message: 'Erro ao buscar arte', success: false })
  }
}

export async function uploadAndCreateArte(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const upload = (request as any).arteUploadData
    const { nome, descricao, projetoId } = upload.fields

    if (usuario.tipo !== 'ADMIN') {
      const projeto = await prisma.projeto.findFirst({
        where: { id: projetoId, OR: [{ designerId: usuario.id }, { clienteId: usuario.id }] },
        select: { id: true },
      })
      if (!projeto) {
        reply.status(403).send({ message: 'Acesso negado ao projeto', success: false })
        return
      }
    }

    // O id precisa existir antes do upload porque a chave do bucket é montada
    // com ele. Tem que ser no formato do banco: `randomUUID()` devolvia um
    // UUID, e aí a arte subia e nenhuma rota `/:id` aceitava o id dela.
    const arteId = novoId()
    // Always use a UUID-based key — never trust the original filename for the storage path
    const ext = upload.filename.includes('.') ? upload.filename.split('.').pop() : ''
    const key = `artes/${projetoId}/${arteId}/v1/${arteId}${ext ? '.' + ext : ''}`
    await uploadFile(key, upload.buffer, upload.mimetype)
    const previewUrl = await signPath(key, 3600 * 24)

    const arte = await arteService.createArte({
      id: arteId,
      nome,
      descricao,
      tipo: upload.mimetype,
      tamanho: BigInt(upload.size),
      arquivo: key,
      projetoId,
      autorId: usuario.id,
    })

    notificacaoService.createNotificacao({
      titulo: 'Arte criada',
      conteudo: `${nome} — versão 1`,
      tipo: 'ARTE',
      canal: 'SISTEMA',
      usuarioId: usuario.id,
    }).catch(() => {})

    reply.status(201).send({ data: { ...arte, previewUrl }, success: true })
  } catch (error: any) {
    if (error.message?.includes('não encontrado')) {
      reply.status(400).send({ message: error.message, success: false })
      return
    }
    // Sem esta linha o upload falhava e o log registrava apenas
    // `{"res":{"statusCode":500}}` — a causa (R2 fora do ar, credencial
    // errada, banco recusando) morria aqui e o diagnóstico virava adivinhação.
    request.log.error({ err: error }, 'Falha no upload da arte')

    /*
     * O arquivo não chegou ao armazenamento é um caso à parte.
     *
     * O log já distinguia os motivos; a resposta não — tudo virava 500 "Erro
     * ao criar arte", e quem estava do outro lado não tinha como saber se
     * devia tentar de novo, trocar o arquivo ou parar. São saídas opostas.
     *
     * 503 e não 500: é indisponibilidade, e o cliente pode repetir. E dizer
     * que nada foi criado importa — sem isso a pessoa fica sem saber se subir
     * de novo vai duplicar a arte.
     */
    if (error?.codigo === 'ARMAZENAMENTO_INDISPONIVEL') {
      reply.status(503).send({
        message:
          'O arquivo não chegou ao armazenamento e nada foi criado. Tente de novo em instantes — se continuar, o problema é nosso, não do seu arquivo.',
        codigo: error.codigo,
        success: false,
      })
      return
    }

    reply.status(500).send({ message: 'Erro ao criar arte', success: false })
  }
}

export async function createArte(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const body = request.body as any
    const data = {
      nome: body.nome,
      descricao: body.descricao,
      tipo: body.tipo,
      // arquivo and tamanho are set only by the upload flow — never accepted from JSON body
      projetoId: body.projetoId,
      autorId: usuario.id,
    }
    const arte = await arteService.createArte(data)
    reply.status(201).send({ message: 'Arte criada com sucesso', data: arte, success: true })
  } catch (error: any) {
    if (error.message.includes('não encontrado')) {
      reply.status(400).send({ message: error.message, success: false })
      return
    }
    erroInterno(request, reply, error, 'Erro ao criar arte')
  }
}

export async function updateArte(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { id } = request.params as { id: string }
    const body = request.body as any
    const allowedUpdates: Record<string, any> = {}
    // arquivo, tipo and tamanho are immutable outside the upload flow
    for (const field of ['nome', 'descricao'] as const) {
      if (body[field] !== undefined) allowedUpdates[field] = body[field]
    }
    const arte = await arteService.updateArte(
      id,
      allowedUpdates,
      usuario.id,
      usuario.tipo === 'ADMIN',
    )
    reply.send({ message: 'Arte atualizada com sucesso', data: arte, success: true })
  } catch (error: any) {
    if (error.message.includes('Arte não encontrada')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    if (error.message.includes('Acesso negado')) {
      reply.status(403).send({ message: error.message, success: false })
      return
    }
    erroInterno(request, reply, error, 'Erro ao atualizar arte')
  }
}

export async function deleteArte(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { id } = request.params as { id: string }

    // Fetch before delete to get the storage key
    const arte = await arteService.getArteById(id)
    if (!arte) {
      reply.status(404).send({ message: 'Arte não encontrada', success: false })
      return
    }

    await arteService.deleteArte(id, usuario.id, usuario.tipo === 'ADMIN')

    // Remove from object storage — fire-and-forget so DB delete is never rolled back
    if (arte.arquivo) deleteFile(arte.arquivo).catch(() => {})

    reply.send({ message: 'Arte removida com sucesso', success: true })
  } catch (error: any) {
    if (error.message.includes('Arte não encontrada')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    if (error.message.includes('Acesso negado')) {
      reply.status(403).send({ message: error.message, success: false })
      return
    }
    erroInterno(request, reply, error, 'Erro ao remover arte')
  }
}
