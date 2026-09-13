import prisma from '../database/client.js'
import {
  assertValidTransition,
  estadosNaoTerminais,
  DISPUTA_TRANSITIONS,
} from '../utils/stateMachine.js'
import { estornarFatura, ResultadoEstorno } from './estornoService.js'

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

    // Freeze the fatura's net designer value as saldoBloqueado
    let saldoBloqueado = 0
    if (data.faturaId) {
      const fatura = await prisma.fatura.findUnique({ where: { id: data.faturaId } })
      if (!fatura) throw new Error('Fatura não encontrada')
      if (fatura.projetoId !== data.projetoId) throw new Error('Fatura não pertence ao projeto')
      saldoBloqueado = fatura.valorLiquidoDesigner
    }

    return prisma.disputa.create({
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

    const disputa = await prisma.disputa.findUnique({ where: { id } })
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

    /*
     * O resultado do estorno viaja junto porque a tela precisa dizer o que
     * aconteceu com o dinheiro. `viaGateway: false` significa fatura marcada
     * paga sem passar pelo Mercado Pago: os livros acertaram, mas alguém tem
     * que mover o valor à mão — e quem arbitrou é quem precisa saber disso,
     * não um log que ninguém lê.
     */
    return { ...atualizada, estorno }
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
