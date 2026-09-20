import type { Plano } from '@prisma/client'
import prisma from '../database/client.js'
import { planoGratuitoDoDesigner } from './planoGratuito.js'
import { comPlanoFormatado } from './planoFormatado.js'

/**
 * Qual plano vale para esta pessoa AGORA.
 *
 * Existe como função única porque a resposta era lida em três lugares que
 * precisavam concordar e não concordavam:
 *
 *   - `taxaDoDesigner` caía no plano Gratuito quando não havia assinatura;
 *   - `requirePlanLimit` caía nas variáveis BETA_MAX_*;
 *   - `/assinaturas/minha` não caía em nada e respondia `null`, e a tela
 *     desenhava "Você ainda não tem uma assinatura ativa" para quem o resto do
 *     sistema já tratava como assinante do Gratuito.
 *
 * Três fontes para uma pergunta só. Os números hoje batem por coincidência
 * (BETA_MAX_PROJETOS é 3, e o Gratuito também limita 3), e bastaria alguém
 * mexer num dos dois para o designer ser cobrado pela taxa de um plano e
 * limitado pelos tetos de outro — divergência que só apareceria na fatura de
 * alguém.
 *
 * Aqui a regra é uma: a assinatura que estiver valendo; na ausência dela, o
 * Gratuito. É o que o código já declarava em prosa — "quem não assina nada
 * ESTÁ no plano gratuito; a ausência de assinatura é o plano, não a ausência
 * de plano" — e agora é o que ele faz.
 */

export type PlanoFormatado = ReturnType<typeof comPlanoFormatado<Plano>>

/** Os estados em que uma assinatura ainda pode estar valendo. */
const EM_VIGOR = ['ATIVA', 'PENDENTE', 'PAUSADA']

export type Vigencia = {
  /**
   * A linha assinada, quando existe. `null` significa que a pessoa está no
   * Gratuito sem ter assinado nada — e não que ela esteja sem plano.
   */
  assinatura: Awaited<ReturnType<typeof buscarAssinatura>>
  /** O plano em vigor, formatado. `null` só se não houver Gratuito cadastrado. */
  plano: PlanoFormatado | null
  /**
   * Cancelada, mas ainda valendo até esta data. `null` quando não é o caso.
   *
   * Cancelar não derruba na hora: quem pagou o mês tem o mês. O estado
   * "cancelada e correndo" é `ATIVA` com `renovacaoAutomatica: false` — não
   * precisou de coluna nova porque o campo já existia e o Gratuito nunca o
   * tem desligado.
   */
  vigenteAte: Date | null
  cancelada: boolean
}

function buscarAssinatura(usuarioId: string) {
  return prisma.assinatura.findFirst({
    where: { usuarioId, status: { in: EM_VIGOR } },
    include: { plano: true },
    orderBy: { criadoEm: 'desc' },
  })
}

/**
 * Vence o que passou da data.
 *
 * Não há job no backend, então a expiração acontece na leitura. O `updateMany`
 * é guardado pelo próprio status e pela data: duas requisições simultâneas
 * escrevem a mesma coisa e a segunda não encontra linha, em vez de as duas
 * contarem o vencimento duas vezes.
 */
async function venceSePassou(assinatura: { id: string; status: string; periodoFim: Date | null }) {
  if (assinatura.status !== 'ATIVA') return false
  if (!assinatura.periodoFim || assinatura.periodoFim > new Date()) return false

  await prisma.assinatura.updateMany({
    where: { id: assinatura.id, status: 'ATIVA', periodoFim: { lte: new Date() } },
    data: { status: 'EXPIRADA', renovacaoAutomatica: false },
  })
  return true
}

export async function assinaturaVigente(usuarioId: string): Promise<Vigencia> {
  const assinatura = await buscarAssinatura(usuarioId)

  if (assinatura && (await venceSePassou(assinatura))) {
    // Venceu agora: a pessoa cai no Gratuito, que é o mesmo lugar de quem
    // nunca assinou. Sem isto, cancelar deixava o designer sem plano nenhum.
    const gratuito = await planoGratuitoDoDesigner()
    return {
      assinatura: null,
      plano: gratuito ? comPlanoFormatado(gratuito) : null,
      vigenteAte: null,
      cancelada: false,
    }
  }

  if (!assinatura) {
    const gratuito = await planoGratuitoDoDesigner()
    return {
      assinatura: null,
      plano: gratuito ? comPlanoFormatado(gratuito) : null,
      vigenteAte: null,
      cancelada: false,
    }
  }

  const cancelada = assinatura.status === 'ATIVA' && !assinatura.renovacaoAutomatica
  return {
    assinatura,
    plano: comPlanoFormatado(assinatura.plano),
    vigenteAte: cancelada ? assinatura.periodoFim : null,
    cancelada,
  }
}

/**
 * Só o plano em vigor — para quem precisa da taxa ou do teto e não da
 * assinatura inteira.
 */
export async function planoVigente(usuarioId: string) {
  return (await assinaturaVigente(usuarioId)).plano
}
