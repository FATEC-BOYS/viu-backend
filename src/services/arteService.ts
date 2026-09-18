// src/services/arteService.ts
/**
 * Serviço para Artes
 *
 * Responsável por operações de CRUD nas artes/arquivos associados aos
 * projetos. Inclui validação de relacionamento com projetos e usuários
 * (autor) e suporta filtros de listagem básicos.
 */

import prisma from '../database/client.js'
import { assertValidTransition, ARTE_TRANSITIONS } from '../utils/stateMachine.js'
import { PROJETO_ACCESS_SELECT, assertAcessoAoProjeto } from '../utils/projectAccess.js'

export interface ListArtesParams {
  page?: number
  limit?: number
  projetoId?: string
  projetoIds?: string[] // access-control scope (set by controller for non-admins)
  autorId?: string
  /** Cliente do projeto a que a arte pertence. */
  clienteId?: string
  status?: string
  tipo?: string
  search?: string
  orderBy?: OrdemDeArtes
}

/**
 * As ordens que a listagem sabe aplicar.
 *
 * A direção vai junto com o campo, e não como parâmetro à parte, porque cada
 * um destes só tem um sentido útil: ninguém pede "as artes mais antigas
 * primeiro" tanto quanto pede "as mais recentes", e por nome ou projeto o que
 * se quer é ordem alfabética. Um par campo+direção dobraria as combinações
 * para oferecer as que ninguém escolhe.
 */
export type OrdemDeArtes = 'criado_em' | 'nome' | 'projeto' | 'versao' | 'tamanho'

/*
 * Toda ordem termina no `id`, e isso não é detalhe.
 *
 * Nenhum destes campos é único — `versao` tem dois ou três valores no produto
 * inteiro, e `projeto` repete em todas as artes do mesmo projeto. Com empate e
 * `skip`/`take`, o banco não deve ordem nenhuma entre as linhas empatadas: a
 * consulta da página 1 e a da página 2 podem desempatar diferente, e aí uma
 * arte aparece nas duas enquanto outra não aparece em nenhuma.
 *
 * Tentei reproduzir localmente — quinze artes com o mesmo `criadoEm`, com e sem
 * escrita concorrente — e a ordem se manteve: com tabela pequena o plano não
 * varia. Isso não torna o desempate opcional, torna a falha silenciosa. Ela
 * depende do plano (varredura paralela, índice diferente, linha reescrita por
 * um UPDATE), então aparece em produção, com volume, e não na bancada. É o
 * mesmo acordo implícito que corrigimos no viewer: duas consultas concordando
 * por uma ordenação que nenhuma das duas declara.
 *
 * `id` é único e indexado, então o desempate é de graça.
 */
const ORDENS: Record<OrdemDeArtes, any> = {
  criado_em: [{ criadoEm: 'desc' }, { id: 'asc' }],
  nome: [{ nome: 'asc' }, { id: 'asc' }],
  projeto: [{ projeto: { nome: 'asc' } }, { id: 'asc' }],
  versao: [{ versao: 'desc' }, { id: 'asc' }],
  tamanho: [{ tamanho: 'desc' }, { id: 'asc' }],
}

export class ArteService {
  /**
   * Lista artes com filtros opcionais e paginação.
   */
  async listArtes({
    page = 1,
    limit = 10,
    projetoId,
    projetoIds,
    autorId,
    clienteId,
    status,
    tipo,
    search,
    orderBy,
  }: ListArtesParams) {
    const skip = (page - 1) * limit
    // projetoId (filtro de quem chama) e projetoIds (escopo de acesso) são
    // acumulativos. Antes o filtro *substituía* o escopo — pedir um projeto
    // específico apagava a restrição de acesso, e o service só não vazava
    // porque o controller conferia antes. Agora a listagem é segura sozinha,
    // como já era em aprovacaoService e feedbackService.
    const projetoConditions: any[] = []
    if (projetoId) projetoConditions.push({ projetoId })
    if (projetoIds) projetoConditions.push({ projetoId: { in: projetoIds } })

    const where: any = {
      ...(projetoConditions.length === 1 && projetoConditions[0]),
      ...(projetoConditions.length > 1 && { AND: projetoConditions }),
      ...(autorId && { autorId }),
      // O cliente não é campo da arte: ele mora no projeto. Filtrar por ele
      // era o único filtro da tela que não tinha como ser atendido aqui.
      ...(clienteId && { projeto: { clienteId } }),
      ...(status && { status }),
      ...(tipo && { tipo }),
      ...(search && { nome: { contains: search } }),
    }
    const [artes, total, porStatus] = await Promise.all([
      prisma.arte.findMany({
        where,
        skip,
        take: Number(limit),
        include: {
          autor: {
            select: { id: true, nome: true, avatar: true },
          },
          projeto: {
            select: {
              id: true,
              nome: true,
              /*
               * O cliente do projeto vai junto.
               *
               * Sem ele, três coisas na tela de Artes ficavam mortas: todo
               * cartão dizia "Cliente: —", o filtro "Todos Clientes" nascia
               * sempre vazio (a lista é montada a partir destes nomes) e a
               * busca prometia "arte, projeto, cliente ou autor" sem nunca
               * poder casar um cliente. O frontend já lia
               * `projeto.cliente.nome`; era o servidor que não mandava.
               *
               * `select` explícito, não `include`: o cliente é um usuário, e
               * `include` traria a linha inteira — senha, tokens e o resto —
               * para uma listagem que só precisa do nome.
               */
              cliente: { select: { id: true, nome: true } },
            },
          },
          _count: {
            select: { feedbacks: true, aprovacoes: true },
          },
        },
        // Ordem desconhecida cai na mais recente, que é o padrão da tela.
        orderBy: (orderBy && ORDENS[orderBy]) ?? ORDENS.criado_em,
      }),
      prisma.arte.count({ where }),
      /*
       * As contagens por status do conjunto FILTRADO — não da página.
       *
       * A tela somava os status das artes que tinha na mão e escrevia o
       * resultado ao lado do total. Com uma página só os dois números falavam
       * do mesmo conjunto e ninguém percebia; com duas, o cabeçalho dizia
       * "13 itens" e "4 em análise" sobre as mesmas artes.
       *
       * Mesmo `where` da listagem, porque é ele que o total descreve.
       */
      prisma.arte.groupBy({ by: ['status'], where, _count: { _all: true } }),
    ])
    return {
      artes,
      total,
      porStatus: Object.fromEntries(
        porStatus.map((g: any) => [g.status, g._count._all]),
      ) as Record<string, number>,
    }
  }

  /**
   * Os valores por que da para filtrar a listagem de artes.
   *
   * A tela montava estas listas a partir das artes que já estavam na mão — o
   * resultado da página atual, que já vem filtrado. Isso se mordia: escolher
   * um cliente reduzia o resultado, e a lista de clientes passava a ter só
   * ele, então trocar de cliente exigia limpar tudo antes. Pior: com o filtro
   * dando zero resultados a lista nascia vazia e o valor escolhido sumia do
   * próprio campo — filtro aplicado e invisível, que é como se acha que a tela
   * está mostrando tudo.
   *
   * O escopo aqui é o mesmo da listagem (`projetoIds` quando não é admin), e
   * não o resultado dela: são as opções possíveis, não as presentes.
   */
  async facetasDeArtes({ projetoIds }: { projetoIds?: string[] } = {}) {
    const escopo = projetoIds ? { projetoId: { in: projetoIds } } : {}

    const [projetos, autores, tipos] = await Promise.all([
      // Só projetos que têm arte: oferecer um projeto vazio é oferecer um
      // filtro que só pode dar lista vazia.
      prisma.projeto.findMany({
        where: {
          ...(projetoIds && { id: { in: projetoIds } }),
          artes: { some: {} },
        },
        select: { id: true, nome: true, cliente: { select: { id: true, nome: true } } },
        orderBy: { nome: 'asc' },
      }),
      /*
       * `groupBy` e não `distinct`.
       *
       * O `distinct` do Prisma não vira `SELECT DISTINCT`: ele emite um SELECT
       * sem distinção nenhuma e deduplica em memória, no cliente. Conferido no
       * SQL emitido pela 6.19 — `SELECT id, "autorId" FROM artes ORDER BY …`,
       * a tabela inteira, para devolver um autor. Como isto é chamado a cada
       * carga de /artes, uma conta com milhares de artes traria milhares de
       * linhas para responder três nomes.
       *
       * `groupBy` emite `GROUP BY` de verdade, e aí são tantas linhas quantos
       * são os valores.
       */
      prisma.arte.groupBy({ by: ['autorId'], where: escopo }),
      prisma.arte.groupBy({ by: ['tipo'], where: escopo, orderBy: { tipo: 'asc' } }),
    ])

    // Os nomes dos autores, num lote só: o groupBy devolve ids.
    const nomesDeAutores = autores.length
      ? await prisma.usuario.findMany({
          where: { id: { in: autores.map((a) => a.autorId) } },
          select: { id: true, nome: true },
          orderBy: { nome: 'asc' },
        })
      : []

    // Um cliente com dois projetos apareceria duas vezes.
    const clientes = new Map<string, { id: string; nome: string }>()
    for (const p of projetos) {
      if (p.cliente) clientes.set(p.cliente.id, { id: p.cliente.id, nome: p.cliente.nome })
    }

    return {
      projetos: projetos.map((p) => ({ id: p.id, nome: p.nome })),
      clientes: [...clientes.values()].sort((a, b) => a.nome.localeCompare(b.nome)),
      autores: nomesDeAutores,
      tipos: tipos.map((t) => t.tipo).filter(Boolean),
    }
  }

  /**
   * Busca uma arte por ID, incluindo relacionamentos principais.
   */
  async getArteById(id: string) {
    const arte = await prisma.arte.findUnique({
      where: { id },
      include: {
        autor: { select: { id: true, nome: true, avatar: true } },
        projeto: { select: { id: true, nome: true } },
        feedbacks: {
          include: {
            autor: { select: { id: true, nome: true, avatar: true } },
          },
          orderBy: { criadoEm: 'desc' },
        },
        aprovacoes: {
          include: {
            aprovador: { select: { id: true, nome: true, avatar: true } },
          },
          orderBy: { criadoEm: 'desc' },
        },
      },
    })
    return arte
  }

  /**
   * Cria uma nova arte. Verifica se o projeto e o autor existem.
   * @throws Error quando projeto ou autor não existirem.
   */
  async createArte(data: any) {
    const [projeto, autor] = await Promise.all([
      prisma.projeto.findUnique({ where: { id: data.projetoId } }),
      prisma.usuario.findUnique({ where: { id: data.autorId } }),
    ])
    if (!projeto) {
      throw new Error('Projeto não encontrado')
    }
    if (!autor) {
      throw new Error('Autor não encontrado')
    }
    const arte = await prisma.arte.create({ data })
    return arte
  }

  /**
   * Atualiza uma arte existente.
   *
   * `requesterId` não é opcional de propósito: até então a autorização desta
   * operação vivia inteira no middleware da rota, e um furo lá (ver
   * requireProjectAccess) virava escrita em arte de outro tenant. Agora o
   * service é a autoridade final e não depende de quem o chama.
   *
   * @throws Error se a arte não for encontrada ou o requisitante não tiver acesso.
   */
  async updateArte(id: string, updateData: any, requesterId: string, isAdmin = false) {
    const existingArte = await prisma.arte.findUnique({
      where: { id },
      include: { projeto: { select: PROJETO_ACCESS_SELECT } },
    })
    if (!existingArte) {
      throw new Error('Arte não encontrada')
    }
    assertAcessoAoProjeto(existingArte.projeto, requesterId, isAdmin)

    if (updateData.status && updateData.status !== existingArte.status) {
      assertValidTransition('Arte', ARTE_TRANSITIONS, existingArte.status, updateData.status)
    }

    const arte = await prisma.arte.update({ where: { id }, data: updateData })
    return arte
  }

  /**
   * Remove uma arte do banco.
   * @throws Error se a arte não for encontrada ou o requisitante não tiver acesso.
   */
  async deleteArte(id: string, requesterId: string, isAdmin = false) {
    const existingArte = await prisma.arte.findUnique({
      where: { id },
      include: { projeto: { select: PROJETO_ACCESS_SELECT } },
    })
    if (!existingArte) {
      throw new Error('Arte não encontrada')
    }
    assertAcessoAoProjeto(existingArte.projeto, requesterId, isAdmin)

    await prisma.arte.delete({ where: { id } })
    return
  }
}