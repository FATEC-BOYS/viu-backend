import prisma from '../database/client.js'
import {
  assertValidTransition,
  estadosNaoTerminais,
  DISPUTA_TRANSITIONS,
} from '../utils/stateMachine.js'
import { estornarFatura, ResultadoEstorno } from './estornoService.js'
import { notificacaoService } from './notificacaoService.js'
import { formatCurrency } from '../utils/formatters.js'

export type DisputaTipo = 'CALOTE' | 'ENTREGA_INCOMPLETA' | 'FRAUDE' | 'OUTRO'
export type DisputaStatus = 'ABERTA' | 'EM_ANALISE' | 'RESOLVIDA_DESIGNER' | 'RESOLVIDA_CLIENTE' | 'ESCALADA'

export interface AbrirDisputaInput {
  tipo: DisputaTipo
  descricao: string
  abertaPorId: string
  projetoId: string
  faturaId?: string
}

export interface ResolverDisputaInput {
  resolucao: string
  status: 'RESOLVIDA_DESIGNER' | 'RESOLVIDA_CLIENTE' | 'ESCALADA'
}

const TIPOS_VALIDOS: DisputaTipo[] = ['CALOTE', 'ENTREGA_INCOMPLETA', 'FRAUDE', 'OUTRO']
const STATUS_FINAIS: DisputaStatus[] = ['RESOLVIDA_DESIGNER', 'RESOLVIDA_CLIENTE', 'ESCALADA']

/**
 * Estados em que a disputa ainda está de pé — os mesmos que o `saqueService`
 * usa para decidir o que não é sacável. Sai da máquina de estados, não de uma
 * lista à mão, pelo motivo de sempre: lista copiada sai de sincronia e o efeito
 * de errar aqui é dinheiro liberado no meio de uma disputa.
 */
const AINDA_EM_DISPUTA = estadosNaoTerminais(DISPUTA_TRANSITIONS)

/*
 * O nome do tipo em português, para o aviso não chegar escrito
 * `ENTREGA_INCOMPLETA`. Fica junto da união, como o `ROTULO_NOTIFICACAO`: o
 * `Record` completo obriga o par, então tipo novo sem rótulo não compila.
 */
const ROTULO_TIPO: Record<DisputaTipo, string> = {
  CALOTE: 'calote',
  ENTREGA_INCOMPLETA: 'entrega incompleta',
  FRAUDE: 'fraude',
  OUTRO: 'outro assunto',
}

export class DisputaService {
  async abrirDisputa(data: AbrirDisputaInput) {
    if (!TIPOS_VALIDOS.includes(data.tipo)) {
      throw new Error(`Tipo de disputa inválido: ${data.tipo}`)
    }

    const projeto = await prisma.projeto.findUnique({ where: { id: data.projetoId } })
    if (!projeto) throw new Error('Projeto não encontrado')
    if (projeto.designerId !== data.abertaPorId && projeto.clienteId !== data.abertaPorId) {
      throw new Error('Acesso negado: apenas participantes do projeto podem abrir disputas')
    }

    /*
     * O valor retido sai da fatura escolhida — e este caminho não era usado.
     *
     * O mecanismo inteiro existia e estava morto: `saldoBloqueado` só era
     * preenchido quando vinha `faturaId`, e nenhuma tela mandava `faturaId`.
     * Conferido no app: fatura PAGA de R$ 10.800, disputa de CALOTE aberta do
     * jeito que a tela abre, `saldoBloqueado: 0` e o saldo do designer intacto.
     * Ou seja, a subtração em `getSaldoDisponivel`, a checagem SERIALIZABLE de
     * `solicitarSaque`, o bloco "Bloqueado em disputa" do saldo e o estorno na
     * resolução eram todos código que a interface do produto não alcançava.
     *
     * Agora a tela pergunta qual fatura está em disputa. Com a pergunta feita,
     * as duas guardas abaixo passam a importar.
     */
    let saldoBloqueado = 0
    if (data.faturaId) {
      const fatura = await prisma.fatura.findUnique({ where: { id: data.faturaId } })
      if (!fatura) throw new Error('Fatura não encontrada')
      if (fatura.projetoId !== data.projetoId) throw new Error('Fatura não pertence ao projeto')

      /*
       * Uma fatura, uma retenção.
       *
       * `getSaldoDisponivel` soma `saldoBloqueado` de TODAS as disputas não
       * terminadas do designer. Duas disputas em aberto sobre a mesma fatura
       * descontariam o mesmo dinheiro duas vezes — e bastaria abrir a segunda
       * para derrubar o saldo abaixo do que a fatura vale.
       */
      const jaEmDisputa = await prisma.disputa.findFirst({
        where: { faturaId: data.faturaId, status: { in: AINDA_EM_DISPUTA } },
        select: { id: true },
      })
      if (jaEmDisputa) throw new Error('Já existe uma disputa em aberto para esta fatura')

      /*
       * Só fatura PAGA tem o que reter.
       *
       * O saldo do designer é `Σ fatura.valorLiquidoDesigner (PAGA) − saques −
       * Σ saldoBloqueado`. Congelar o líquido de uma fatura PENDENTE subtrairia
       * um valor que nunca entrou na soma: o CALOTE — que é exatamente a
       * disputa sobre fatura não paga — deixaria o saldo negativo pelo valor de
       * um dinheiro que ninguém recebeu. A disputa continua valendo; o que não
       * existe é o que reter.
       */
      if (fatura.status === 'PAGA') saldoBloqueado = fatura.valorLiquidoDesigner
    }

    const disputa = await prisma.disputa.create({
      data: {
        tipo: data.tipo,
        descricao: data.descricao,
        abertaPorId: data.abertaPorId,
        projetoId: data.projetoId,
        faturaId: data.faturaId,
        saldoBloqueado,
        status: 'ABERTA',
      },
      include: {
        abertaPor: { select: { id: true, nome: true, email: true, tipo: true } },
        projeto: { select: { id: true, nome: true } },
        fatura: { select: { id: true, valor: true, status: true } },
      },
    })

    this.avisarDaAbertura(disputa, {
      designerId: projeto.designerId,
      clienteId: projeto.clienteId,
      projetoNome: projeto.nome,
    })

    return disputa
  }

  /*
   * Quem precisa saber que uma disputa foi aberta.
   *
   * Antes: ninguém. O outro lado descobria que o dinheiro dele estava retido
   * olhando o saldo encolher, e o admin — a quem a tela promete "nossa equipe
   * entrará em contato em até 48h" — não era avisado por caminho nenhum. A
   * promessa dependia de alguém abrir a lista de disputas por conta própria.
   *
   * Fora do caminho da resposta, e com o erro virando log: um aviso que falha
   * não pode derrubar uma disputa que já foi gravada.
   */
  private avisarDaAbertura(
    disputa: { id: string; tipo: string; abertaPorId: string; saldoBloqueado: number },
    projeto: { designerId: string; clienteId: string; projetoNome: string },
  ): void {
    const alvo = { entidadeTipo: 'DISPUTA', entidadeId: disputa.id } as const
    const outroLado =
      projeto.designerId === disputa.abertaPorId ? projeto.clienteId : projeto.designerId

    /*
     * A frase sobre o dinheiro é a parte que não pode faltar nem ser vaga: é o
     * único aviso que o designer recebe antes de tentar sacar e não conseguir.
     */
    const sobreODinheiro =
      disputa.saldoBloqueado > 0
        ? ` ${formatCurrency(disputa.saldoBloqueado)} ficam retidos do designer até a disputa ser resolvida.`
        : ' Nenhum valor está retido.'

    notificacaoService.dispatch(
      outroLado,
      'DISPUTA_ABERTA',
      'Disputa aberta no seu projeto ⚖️',
      `Foi aberta uma disputa de ${ROTULO_TIPO[disputa.tipo as DisputaTipo] ?? disputa.tipo} no projeto "${projeto.projetoNome}".${sobreODinheiro}`,
      alvo,
    )

    prisma.usuario
      .findMany({ where: { tipo: 'ADMIN', ativo: true }, select: { id: true } })
      .then((admins) => {
        for (const admin of admins) {
          notificacaoService.dispatch(
            admin.id,
            'DISPUTA_ABERTA',
            'Nova disputa para arbitrar ⚖️',
            `Disputa de ${ROTULO_TIPO[disputa.tipo as DisputaTipo] ?? disputa.tipo} no projeto "${projeto.projetoNome}".${sobreODinheiro}`,
            alvo,
          )
        }
      })
      .catch((err) => console.error('[disputa] falha ao avisar os admins:', err))
  }

  async listarDisputas(filtros: { participanteId?: string; projetoId?: string; status?: string }) {
    return prisma.disputa.findMany({
      where: {
        // participanteId matches both the opener AND the other party in the project
        ...(filtros.participanteId
          ? {
              OR: [
                { abertaPorId: filtros.participanteId },
                { projeto: { OR: [{ designerId: filtros.participanteId }, { clienteId: filtros.participanteId }] } },
              ],
            }
          : {}),
        ...(filtros.projetoId ? { projetoId: filtros.projetoId } : {}),
        ...(filtros.status ? { status: filtros.status } : {}),
      },
      include: {
        abertaPor: { select: { id: true, nome: true, email: true, tipo: true } },
        projeto: { select: { id: true, nome: true } },
        fatura: { select: { id: true, valor: true, status: true } },
      },
      orderBy: { criadoEm: 'desc' },
    })
  }

  async getDisputa(id: string) {
    return prisma.disputa.findUnique({
      where: { id },
      include: {
        abertaPor: { select: { id: true, nome: true, email: true, tipo: true } },
        projeto: { select: { id: true, nome: true, designerId: true, clienteId: true } },
        fatura: { select: { id: true, valor: true, status: true, valorLiquidoDesigner: true } },
      },
    })
  }

  async resolverDisputa(id: string, data: ResolverDisputaInput) {
    if (!STATUS_FINAIS.includes(data.status as DisputaStatus)) {
      throw new Error(`Status de resolução inválido: ${data.status}`)
    }

    const disputa = await prisma.disputa.findUnique({
      where: { id },
      // Os dois lados vêm junto porque os dois precisam ser avisados do
      // desfecho: é a arbitragem mexendo no dinheiro de ambos.
      include: { projeto: { select: { nome: true, designerId: true, clienteId: true } } },
    })
    if (!disputa) throw new Error('Disputa não encontrada')
    assertValidTransition('Disputa', DISPUTA_TRANSITIONS, disputa.status, data.status)

    /*
     * `ESCALADA` é um dos status aceitos aqui, mas escalar não é resolver:
     * a disputa continua de pé e o `saqueService` continua contando esse
     * estado como bloqueante. Zerar `saldoBloqueado` em toda saída fazia com
     * que escalar liberasse o dinheiro — a soma passava a ser zero mesmo com
     * a linha ainda casando o filtro. O bloqueio só cai quando a disputa
     * realmente termina.
     */
    const terminou = !AINDA_EM_DISPUTA.includes(data.status)

    /*
     * Decidir pelo cliente é devolver o dinheiro — e antes disto não devolvia.
     *
     * O saldo do designer é `Σ fatura.valorLiquidoDesigner (PAGA) − saques −
     * Σ saldoBloqueado`. Resolver zerava o bloqueio e deixava a fatura PAGA,
     * então a parcela voltava para a soma: julgar A FAVOR DO CLIENTE pagava o
     * designer. A tela dizia uma coisa e o extrato fazia o contrário.
     *
     * O estorno vem ANTES da escrita da resolução, e de propósito. Se o
     * gateway recusar, o erro sobe e a disputa continua em aberto — melhor do
     * que uma disputa marcada "resolvida a favor do cliente" com o dinheiro
     * ainda no saldo do designer, que é um acerto que ninguém mais vai
     * procurar.
     *
     * Disputa sem `faturaId` não tem o que estornar: é reclamação sobre
     * entrega antes de haver cobrança, e continua sendo resolvível.
     */
    let estorno: ResultadoEstorno | null = null
    if (data.status === 'RESOLVIDA_CLIENTE' && disputa.faturaId) {
      estorno = await estornarFatura(
        disputa.faturaId,
        `Disputa resolvida a favor do cliente: ${data.resolucao}`,
      )
    }

    const atualizada = await prisma.disputa.update({
      where: { id },
      data: {
        status: data.status,
        resolucao: data.resolucao,
        resolvidaEm: terminou ? new Date() : null,
        ...(terminou ? { saldoBloqueado: 0 } : {}),
      },
      include: {
        abertaPor: { select: { id: true, nome: true, email: true } },
        projeto: { select: { id: true, nome: true } },
      },
    })

    this.avisarDoDesfecho(disputa, data.status, estorno)

    /*
     * O resultado do estorno viaja junto porque a tela precisa dizer o que
     * aconteceu com o dinheiro. `viaGateway: false` significa fatura marcada
     * paga sem passar pelo Mercado Pago: os livros acertaram, mas alguém tem
     * que mover o valor à mão — e quem arbitrou é quem precisa saber disso,
     * não um log que ninguém lê.
     */
    return { ...atualizada, estorno }
  }

  /*
   * O desfecho contado aos dois lados, com o que aconteceu com o dinheiro.
   *
   * Resolver uma disputa move saldo — libera a retenção para o designer ou
   * estorna a fatura para o cliente — e ninguém era avisado. Quem tinha o valor
   * retido só descobriria voltando na tela de saques; quem recebeu o estorno,
   * olhando o extrato do banco.
   *
   * A frase segue o que de fato aconteceu, não o rótulo do status: `ESCALADA`
   * mantém a retenção, e dizer "encerrada" ali seria mentir sobre um dinheiro
   * que continua preso.
   */
  private avisarDoDesfecho(
    disputa: {
      id: string
      saldoBloqueado: number
      projeto: { nome: string; designerId: string; clienteId: string }
    },
    destino: ResolverDisputaInput['status'],
    estorno: ResultadoEstorno | null,
  ): void {
    const alvo = { entidadeTipo: 'DISPUTA', entidadeId: disputa.id } as const
    const projeto = `"${disputa.projeto.nome}"`
    const retido = formatCurrency(disputa.saldoBloqueado)

    let titulo: string
    let conteudo: string
    if (destino === 'ESCALADA') {
      titulo = 'Disputa escalada ⚖️'
      conteudo =
        disputa.saldoBloqueado > 0
          ? `A disputa do projeto ${projeto} subiu para análise e continua em aberto. ${retido} seguem retidos.`
          : `A disputa do projeto ${projeto} subiu para análise e continua em aberto.`
    } else if (destino === 'RESOLVIDA_DESIGNER') {
      titulo = 'Disputa resolvida a favor do designer ✅'
      conteudo =
        disputa.saldoBloqueado > 0
          ? `A disputa do projeto ${projeto} foi encerrada a favor do designer. ${retido} voltaram a ficar disponíveis para saque.`
          : `A disputa do projeto ${projeto} foi encerrada a favor do designer.`
    } else {
      titulo = 'Disputa resolvida a favor do cliente ✅'
      if (!estorno) {
        conteudo = `A disputa do projeto ${projeto} foi encerrada a favor do cliente. Não havia fatura paga para estornar.`
      } else if (!estorno.aplicado) {
        conteudo = `A disputa do projeto ${projeto} foi encerrada a favor do cliente. A fatura já estava estornada.`
      } else if (estorno.viaGateway) {
        conteudo = `A disputa do projeto ${projeto} foi encerrada a favor do cliente. ${formatCurrency(estorno.valorDevolvido)} foram estornados pelo Mercado Pago.`
      } else {
        /*
         * O caso que mais precisa ser dito em voz alta: os livros acertaram,
         * mas o dinheiro não se moveu. Sem este aviso o cliente fica esperando
         * um estorno que não está a caminho.
         */
        conteudo = `A disputa do projeto ${projeto} foi encerrada a favor do cliente. ${formatCurrency(estorno.valorDevolvido)} foram baixados nos registros, mas esta fatura não passou pelo Mercado Pago — a devolução precisa ser feita por fora.`
      }
    }

    for (const usuarioId of [disputa.projeto.designerId, disputa.projeto.clienteId]) {
      notificacaoService.dispatch(usuarioId, 'DISPUTA_RESOLVIDA', titulo, conteudo, alvo)
    }
  }

  async moverParaAnalise(id: string) {
    const disputa = await prisma.disputa.findUnique({ where: { id }, select: { status: true } })
    if (!disputa) throw new Error('Disputa não encontrada')
    assertValidTransition('Disputa', DISPUTA_TRANSITIONS, disputa.status, 'EM_ANALISE')
    return prisma.disputa.update({
      where: { id },
      data: { status: 'EM_ANALISE' },
    })
  }
}
