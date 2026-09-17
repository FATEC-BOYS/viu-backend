import crypto from 'crypto'
import prisma from '../database/client.js'
import {
  renderizarAnexo,
  TEMPLATE_VERSAO,
  TEMPLATE_REVISADO_JURIDICAMENTE,
  type DadosAnexo,
} from '../templates/anexoRevisao.js'
import { camposFaltantes } from './termosProjetoService.js'
import { env } from '../config/env.js'

/**
 * O anexo de revisão congelado — o documento que as partes aceitam.
 *
 * `TermosProjeto` é estado corrente e muda quando as partes renegociam. Aqui
 * nada muda: `texto` é o que elas leram, palavra por palavra, e o `hash`
 * responde por ele. Um aditivo não altera a versão vigente — cria a seguinte, e
 * a anterior fica SUBSTITUIDA com os aceites dela intactos.
 */

export const TERMOS_INCOMPLETOS = 'Os termos do projeto ainda não estão completos'
export const SEM_CONTRATO_VIGENTE = 'Este projeto não tem contrato vigente'

/** O que a tela mostra e o que o portão recusa, quando ligado. */
export interface PendenciaContrato {
  /** `true` só quando `EXIGIR_CONTRATO_PROJETO` está ligado E há pendência. */
  bloqueia: boolean
  mensagem: string
  faltam: string[]
}

/** sha256 hexadecimal do texto — a prova de que ele não mudou depois. */
export function hashDoTexto(texto: string): string {
  return crypto.createHash('sha256').update(texto, 'utf8').digest('hex')
}

/**
 * Monta o que o template consome, a partir do estado atual do projeto.
 *
 * Separada da gravação para que a prévia e o contrato definitivo leiam
 * exatamente a mesma coisa: se a prévia usasse outro caminho, a pessoa poderia
 * aceitar um texto diferente do que leu.
 */
/**
 * Serialização estável, para dois objetos iguais darem a mesma string.
 *
 * O JSONB do Postgres não preserva a ordem das chaves — ele reordena por
 * tamanho e depois por byte. Um `JSON.stringify` cru compararia o que voltou
 * do banco com o que acabou de ser montado e acharia diferença onde não há.
 */
function canonico(valor: unknown): string {
  if (valor === null || typeof valor !== 'object') return JSON.stringify(valor) ?? 'null'
  if (Array.isArray(valor)) return `[${valor.map(canonico).join(',')}]`
  const obj = valor as Record<string, unknown>
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonico(obj[k])}`)
    .join(',')}}`
}

/**
 * Dois snapshots descrevem o mesmo acordo?
 *
 * `geradoEm` fica de fora: ele diz quando o documento foi impresso, não o que
 * foi combinado. Mantê-lo na conta faria toda conferência depender de relógio
 * — e um contrato gerado um segundo antes da meia-noite em UTC apareceria como
 * desatualizado no segundo seguinte.
 */
export function mesmoAcordo(a: unknown, b: unknown): boolean {
  const semData = (v: unknown) => {
    if (v === null || typeof v !== 'object' || Array.isArray(v)) return v
    const { geradoEm: _ignorado, ...resto } = v as Record<string, unknown>
    return resto
  }
  return canonico(semData(a)) === canonico(semData(b))
}

export function montarDados(projeto: {
  id: string
  nome: string
  descricao: string | null
  orcamento: number | null
  prazo: Date | null
  designer: { id: string; nome: string; email: string }
  cliente: { id: string; nome: string; email: string }
  termos: {
    rodadasIncluidas: number | null
    prazoRevisaoDiasUteis: number | null
    licencaFinalidade: string | null
    licencaTerritorio: string | null
    licencaPrazo: string | null
    licencaPrazoAte: Date | null
    exclusividade: boolean | null
    exclusividadeAte: Date | null
    arquivosFonte: string | null
  } | null
}, geradoEm: Date): DadosAnexo {
  const t = projeto.termos
  return {
    // Nome e e-mail congelados: `Usuario.nome` muda, o contrato não.
    partes: {
      designer: projeto.designer,
      cliente: projeto.cliente,
    },
    projeto: {
      id: projeto.id,
      nome: projeto.nome,
      descricao: projeto.descricao,
      orcamentoCentavos: projeto.orcamento,
      prazo: projeto.prazo?.toISOString() ?? null,
    },
    termos: {
      rodadasIncluidas: t?.rodadasIncluidas ?? null,
      prazoRevisaoDiasUteis: t?.prazoRevisaoDiasUteis ?? null,
      licencaFinalidade: t?.licencaFinalidade ?? null,
      licencaTerritorio: t?.licencaTerritorio ?? null,
      licencaPrazo: t?.licencaPrazo ?? null,
      licencaPrazoAte: t?.licencaPrazoAte?.toISOString() ?? null,
      exclusividade: t?.exclusividade ?? null,
      exclusividadeAte: t?.exclusividadeAte?.toISOString() ?? null,
      arquivosFonte: t?.arquivosFonte ?? null,
    },
    geradoEm: geradoEm.toISOString(),
  }
}

const PROJETO_PARA_CONTRATO = {
  designer: { select: { id: true, nome: true, email: true } },
  cliente: { select: { id: true, nome: true, email: true } },
  termos: true,
} as const

export class ContratoProjetoService {
  /** O contrato que vale agora, com os aceites já registrados. */
  async vigente(projetoId: string) {
    return prisma.contratoProjeto.findFirst({
      where: { projetoId, status: 'VIGENTE' },
      include: {
        aceites: {
          include: { usuario: { select: { id: true, nome: true, email: true } } },
          orderBy: { criadoEm: 'asc' },
        },
      },
    })
  }

  /**
   * Se o contrato vigente ainda descreve os termos de hoje.
   *
   * Nada impede o designer de mudar os termos depois que as duas partes
   * aceitaram — e nada, até agora, dizia que isso tinha acontecido. A tela
   * seguia afirmando "Combinado e aceito pelas duas partes. Pode cobrar."
   * sobre um documento que descreve outro acordo. Neste produto esse documento
   * é o que decide de quem é a peça se a conta não for paga.
   *
   * A comparação é dos DADOS, não do texto.
   *
   * A primeira versão disto renderizava o anexo de novo e comparava o hash com
   * o do vigente — e estava errada de duas formas. A redação do template vai
   * mudar (é o que `TEMPLATE_VERSAO` e `revisadoJuridicamente` existem para
   * acompanhar): no dia em que mudar, todo contrato do produto passaria a se
   * declarar desatualizado sem nada ter sido combinado de novo, e o aviso mais
   * sério da tela viraria ruído em massa. E o texto carrega `Gerado em: …`, o
   * que amarrava a conferência a uma data e abria uma janela para um contrato
   * recém-criado nascer velho na virada do dia em UTC.
   *
   * `ContratoProjeto.dados` existe exatamente para isto, e o comentário dele
   * no schema já dizia: "é o que permite comparar duas versões sem interpretar
   * prosa". Comparando os dados, mudar a redação não mexe em nada e mudar um
   * termo aparece na hora.
   */
  async desatualizado(projetoId: string, vigente: { dados: unknown }): Promise<boolean> {
    const projeto = await prisma.projeto.findUnique({
      where: { id: projetoId },
      include: PROJETO_PARA_CONTRATO,
    })
    if (!projeto) return false

    /*
     * Termos incompletos não contam como desatualizado: o anexo nem seria
     * gerado assim (`gerar` recusa), e marcar o contrato como vencido porque
     * alguém apagou um campo mandaria a pessoa regerar para um erro.
     */
    if (camposFaltantes(projeto.termos).length > 0) return false

    // `new Date()` só para satisfazer a assinatura: `mesmoAcordo` descarta o
    // carimbo de geração antes de comparar.
    return !mesmoAcordo(vigente.dados, montarDados(projeto, new Date()))
  }

  /** Todas as versões, da mais nova para a mais antiga. */
  async historico(projetoId: string) {
    return prisma.contratoProjeto.findMany({
      where: { projetoId },
      include: { aceites: { select: { usuarioId: true, papel: true, criadoEm: true } } },
      orderBy: { versao: 'desc' },
    })
  }

  /**
   * Gera a próxima versão do contrato.
   *
   * Quem pode é o designer do projeto ou um ADMIN — mesma regra de `criarFatura`
   * e de `salvarTermos`, porque é a mesma decisão: o que vai ser cobrado e sob
   * quais condições. O cliente lê e aceita.
   */
  async gerar(projetoId: string, requesterId: string) {
    const projeto = await prisma.projeto.findUnique({
      where: { id: projetoId },
      include: PROJETO_PARA_CONTRATO,
    })
    if (!projeto) throw new Error('Projeto não encontrado')

    const requester = await prisma.usuario.findUnique({ where: { id: requesterId } })
    if (projeto.designerId !== requesterId && requester?.tipo !== 'ADMIN') {
      throw new Error('Apenas o designer do projeto pode gerar o contrato')
    }

    /*
     * Termos incompletos gerariam um anexo cheio de travessões — um documento
     * que diz "Território: —" não protege ninguém e ainda dá a impressão de que
     * há acordo onde não há.
     */
    const faltam = camposFaltantes(projeto.termos)
    if (faltam.length > 0) throw new Error(TERMOS_INCOMPLETOS)

    const geradoEm = new Date()
    const dados = montarDados(projeto, geradoEm)
    const texto = renderizarAnexo(dados)

    const anterior = await prisma.contratoProjeto.findFirst({
      where: { projetoId },
      orderBy: { versao: 'desc' },
      select: { versao: true, hash: true },
    })

    /*
     * Texto idêntico ao vigente não vira versão nova. Sem isto, clicar duas
     * vezes em "gerar" criaria a v2 igual à v1, invalidando os aceites da v1
     * sem que nada tivesse mudado de fato — as partes teriam que reaceitar o
     * mesmo documento.
     */
    const hash = hashDoTexto(texto)
    if (anterior?.hash === hash) {
      const vigente = await this.vigente(projetoId)
      if (vigente) return vigente
    }

    const versao = (anterior?.versao ?? 0) + 1

    return prisma.$transaction(async (tx) => {
      // A anterior sai de cena antes de a nova entrar: dois contratos vigentes
      // no mesmo projeto não teriam como ser desempatados depois.
      await tx.contratoProjeto.updateMany({
        where: { projetoId, status: 'VIGENTE' },
        data: { status: 'SUBSTITUIDO' },
      })

      return tx.contratoProjeto.create({
        data: {
          projetoId,
          versao,
          status: 'VIGENTE',
          texto,
          hash,
          dados: dados as any,
          templateVersao: TEMPLATE_VERSAO,
          revisadoJuridicamente: TEMPLATE_REVISADO_JURIDICAMENTE,
        },
        include: { aceites: true },
      })
    })
  }

  /**
   * Registra o aceite de uma parte.
   *
   * `create`, nunca `upsert`. A versão anterior deste serviço sobrescrevia a
   * linha do usuário a cada aceite — trocava a versão, o IP e a data — e a
   * prova de que ele havia aceitado a redação anterior deixava de existir.
   * Aceite é fato histórico: acumula.
   */
  async aceitar(
    contratoId: string,
    usuarioId: string,
    contexto: { ip?: string; userAgent?: string },
  ) {
    const contrato = await prisma.contratoProjeto.findUnique({
      where: { id: contratoId },
      include: { projeto: { select: { designerId: true, clienteId: true } } },
    })
    if (!contrato) throw new Error('Contrato não encontrado')

    const papel =
      contrato.projeto.designerId === usuarioId
        ? 'DESIGNER'
        : contrato.projeto.clienteId === usuarioId
          ? 'CLIENTE'
          : null

    // Só as partes aceitam. Um terceiro com o id do contrato não vira signatário.
    if (!papel) throw new Error('Acesso negado: apenas as partes do projeto aceitam o contrato')

    /*
     * Aceitar uma versão que já foi substituída registraria concordância com um
     * texto que não rege mais nada — e depois ninguém saberia dizer se a pessoa
     * concordou com o acordo atual.
     */
    if (contrato.status !== 'VIGENTE') throw new Error('Esta versão do contrato não é mais a vigente')

    const jaAceitou = await prisma.aceiteContratual.findFirst({
      where: { usuarioId, contratoId },
    })
    if (jaAceitou) return jaAceitou

    return prisma.aceiteContratual.create({
      data: {
        usuarioId,
        contratoId,
        projetoId: contrato.projetoId,
        papel,
        // A cópia do hash que estava na tela naquele clique. Redundante com
        // `contrato.hash` de propósito: se a linha do contrato for alterada
        // depois, o aceite carrega a própria prova do que foi acordado.
        hashAceito: contrato.hash,
        ip: contexto.ip,
        userAgent: contexto.userAgent,
        termoVersao: contrato.templateVersao,
      },
      include: { usuario: { select: { id: true, nome: true, email: true } } },
    })
  }

  /**
   * Se as duas partes aceitaram a versão vigente.
   *
   * Devolve quem falta, e não só um booleano, porque a tela precisa dizer de
   * quem se está esperando.
   *
   * `usuarioId` é opcional e traz `meuPapel` e `jaAceitei` junto. Não é
   * conveniência: sem isso a tela teria que receber `clienteId` por prop e
   * decidir por conta própria se pode oferecer o botão de aceitar — e errar
   * nessa conta significa oferecer um botão que devolve 403, que é o defeito
   * que este produto já teve em fatura, disputa e arte.
   */
  async estadoDeAceite(projetoId: string, usuarioId?: string) {
    const projeto = await prisma.projeto.findUnique({
      where: { id: projetoId },
      select: { designerId: true, clienteId: true },
    })
    if (!projeto) throw new Error('Projeto não encontrado')

    const meuPapel =
      !usuarioId
        ? null
        : projeto.designerId === usuarioId
          ? 'DESIGNER'
          : projeto.clienteId === usuarioId
            ? 'CLIENTE'
            : null

    const contrato = await this.vigente(projetoId)
    if (!contrato) {
      return {
        contratoId: null,
        versao: null,
        aceitaram: [] as string[],
        faltam: ['DESIGNER', 'CLIENTE'],
        meuPapel,
        jaAceitei: false,
      }
    }

    const aceitaram = contrato.aceites.map((a) => a.usuarioId)
    const faltam: string[] = []
    if (!aceitaram.includes(projeto.designerId)) faltam.push('DESIGNER')
    if (!aceitaram.includes(projeto.clienteId)) faltam.push('CLIENTE')

    return {
      contratoId: contrato.id,
      versao: contrato.versao,
      aceitaram,
      faltam,
      meuPapel,
      // Um ADMIN olhando não é parte: `meuPapel` nulo, e a tela não oferece
      // aceitar — como o serviço recusaria de qualquer forma.
      jaAceitei: !!usuarioId && aceitaram.includes(usuarioId),
    }
  }
}

/**
 * O que falta de contrato para o projeto poder ser faturado.
 *
 * Uma função só para os dois usos — o aviso da tela e a recusa do portão —
 * porque duas listas separadas divergem, e divergirem aqui significa a tela
 * dizer "pode cobrar" enquanto o backend recusa.
 *
 * `bloqueia` depende de `EXIGIR_CONTRATO_PROJETO`. Com o flag desligado a
 * pendência continua sendo calculada e devolvida: é assim que se informa antes
 * de bloquear, em vez de ligar o bloqueio num dia e descobrir no suporte que
 * ninguém mais consegue cobrar.
 */
/**
 * O erro do portão, reconhecível sem ler a frase.
 *
 * O controller mapeava este caso para 422 casando `/contrato/` na MENSAGEM. Ou
 * seja: a copy da tela decidia o código HTTP. Renomear "contrato" para "resumo
 * do combinado" — mudança de redação, nada mais — fez toda fatura barrada pelo
 * portão devolver 500 em vez de 422, e a tela deixaria de saber que bastava
 * gerar ou aceitar o documento. O teste pegou; o conserto é tirar a decisão de
 * cima do texto.
 */
export class ContratoPendenteError extends Error {
  readonly codigo = 'CONTRATO_PENDENTE'
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ContratoPendenteError'
  }
}

export async function pendenciaDeContrato(projetoId: string): Promise<PendenciaContrato | null> {
  const estado = await contratoProjetoService.estadoDeAceite(projetoId)

  if (estado.contratoId && estado.faltam.length === 0) return null

  const mensagem = !estado.contratoId
    ? 'Este projeto ainda não tem o resumo do combinado gerado. Ele é o que registra o que foi acertado e a quem pertence a peça se a conta não for paga.'
    : estado.faltam.length === 2
      ? 'O resumo do combinado ainda não foi aceito pelo designer nem pelo cliente.'
      : estado.faltam[0] === 'CLIENTE'
        ? 'O cliente ainda não aceitou o resumo do combinado.'
        : 'O designer ainda não aceitou o resumo do combinado.'

  return { bloqueia: env.EXIGIR_CONTRATO_PROJETO, mensagem, faltam: estado.faltam }
}

export const contratoProjetoService = new ContratoProjetoService()
