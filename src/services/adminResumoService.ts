import prisma from '../database/client.js'
import { DISPUTA_TRANSITIONS, estadosNaoTerminais } from '../utils/stateMachine.js'

/**
 * Resumo da home do admin: pulso do dia, funil dos links e o que está parado
 * esperando alguém.
 *
 * Tudo numa resposta só de propósito — a tela abre com seis números e duas
 * listas, e quinze requisições para montar isso deixariam a página piscando
 * em pedaços.
 *
 * O que NÃO está aqui, e por quê: "aprovações decididas hoje". `Aprovacao` só
 * guarda `criadoEm`; a linha passa de PENDENTE para APROVADO sem carimbo de
 * quando, e o audit log cobre apenas o POST (a decisão é um PUT). Devolvemos
 * `null` e a tela mostra "—". Inventar um número a partir de `criadoEm` diria
 * "decidido" para uma aprovação apenas solicitada.
 */

export const FUSO_PADRAO = 'America/Sao_Paulo'
const DIAS_DO_FUNIL = 7
const HORAS_PARA_TRAVAR = 48
const LIMITE_FILA = 10
const LIMITE_USUARIOS_RECENTES = 8

/**
 * Deslocamento do fuso em milissegundos no instante dado.
 *
 * Não é constante: existe horário de verão, e mesmo onde não existe hoje a
 * regra pode voltar. Ler do próprio Intl evita o -03:00 escrito à mão que
 * envelhece calado.
 */
function deslocamentoDoFuso(fuso: string, data: Date): number {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: fuso,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(data)

  const p = Object.fromEntries(partes.map((x) => [x.type, x.value])) as Record<string, string>
  const comoSeFosseUtc = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(p.hour), Number(p.minute), Number(p.second),
  )
  return comoSeFosseUtc - data.getTime()
}

/**
 * Instante em que o dia começou no fuso dado.
 *
 * "Hoje" às 22h em São Paulo já é amanhã em UTC: um card que conta por UTC
 * zera três horas antes da meia-noite de quem está olhando, e ninguém entende
 * por quê.
 */
export function inicioDoDia(fuso: string, agora: Date = new Date()): Date {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(agora)

  const p = Object.fromEntries(partes.map((x) => [x.type, x.value])) as Record<string, string>
  const meiaNoiteIngenua = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day))
  return new Date(meiaNoiteIngenua - deslocamentoDoFuso(fuso, new Date(meiaNoiteIngenua)))
}

interface LinhaDoFunil {
  criados: number
  abertos: number
  com_feedback: number
  com_decisao: number
}

export interface ResumoAdmin {
  periodo: { fuso: string; inicioDoDia: Date; funilDesde: Date; geradoEm: Date }
  hoje: {
    contasNovas: number
    projetosCriados: number
    artesEnviadas: number
    linksGerados: number
    feedbacksCriados: number
    aprovacoesSolicitadas: number
    aprovacoesDecididas: null
  }
  funil: { janelaDias: number; criados: number; abertos: number; comFeedback: number; comDecisao: number }
  precisaDeVoce: { saquesPendentes: number; disputasAbertas: number; linksTravados: number }
  fila: Array<{ tipo: 'SAQUE' | 'DISPUTA'; id: string; titulo: string; status: string; criadoEm: Date; href: string }>
  usuariosRecentes: Array<{
    id: string; nome: string; email: string; tipo: string; emailVerificado: boolean; criadoEm: Date
  }>
}

const dinheiro = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export async function obterResumoAdmin(fuso: string = FUSO_PADRAO): Promise<ResumoAdmin> {
  const geradoEm = new Date()
  const desdeHoje = inicioDoDia(fuso, geradoEm)
  const funilDesde = new Date(desdeHoje.getTime() - (DIAS_DO_FUNIL - 1) * 24 * 60 * 60 * 1000)
  const travadoAntesDe = new Date(geradoEm.getTime() - HORAS_PARA_TRAVAR * 60 * 60 * 1000)

  // Disputas: quais estados ainda esperam alguém. Perguntar à máquina de
  // estados em vez de repetir ['ABERTA','EM_ANALISE','ESCALADA'] aqui — lista
  // copiada sai de sincronia no dia em que um estado novo aparece.
  const disputasPendentes = estadosNaoTerminais(DISPUTA_TRANSITIONS)

  const [
    contasNovas, projetosCriados, artesEnviadas, linksGerados, feedbacksCriados,
    aprovacoesSolicitadas, saquesPendentes, disputasAbertas,
    funilBruto, travados, saques, disputas, usuariosRecentes,
  ] = await Promise.all([
    prisma.usuario.count({ where: { criadoEm: { gte: desdeHoje } } }),
    prisma.projeto.count({ where: { criadoEm: { gte: desdeHoje } } }),
    prisma.arte.count({ where: { criadoEm: { gte: desdeHoje } } }),
    prisma.linkCompartilhado.count({ where: { criadoEm: { gte: desdeHoje } } }),
    prisma.feedback.count({ where: { criadoEm: { gte: desdeHoje } } }),
    prisma.aprovacao.count({ where: { criadoEm: { gte: desdeHoje }, deletedAt: null } }),
    prisma.saque.count({ where: { status: 'SOLICITADO' } }),
    prisma.disputa.count({ where: { status: { in: disputasPendentes } } }),

    // Um SELECT para os quatro estágios: em Prisma seriam quatro consultas, e
    // "recebeu feedback depois que o link nasceu" não se expressa no builder.
    prisma.$queryRaw<LinhaDoFunil[]>`
      SELECT
        count(*)::int AS criados,
        count(*) FILTER (WHERE l.acessos > 0)::int AS abertos,
        count(*) FILTER (
          WHERE l.acessos > 0 AND EXISTS (
            SELECT 1 FROM feedbacks f
            WHERE f."arteId" = l."arteId" AND f."criadoEm" >= l."criadoEm"
          )
        )::int AS com_feedback,
        count(*) FILTER (
          WHERE l.acessos > 0 AND EXISTS (
            SELECT 1 FROM aprovacoes a
            WHERE a."arteId" = l."arteId" AND a.status <> 'PENDENTE' AND a."deletedAt" IS NULL
          )
        )::int AS com_decisao
      FROM link_compartilhado l
      WHERE l."criadoEm" >= ${funilDesde} AND l."arteId" IS NOT NULL
    `,

    // Travados olha todos os links vivos, não só os da janela do funil: um
    // link parado há três semanas continua sendo alguém esperando resposta.
    prisma.$queryRaw<Array<{ total: number }>>`
      SELECT count(*)::int AS total
      FROM link_compartilhado l
      WHERE l."arteId" IS NOT NULL
        AND l.revogado = false
        AND (l."expiraEm" IS NULL OR l."expiraEm" > now())
        AND l.acessos > 0
        AND l."criadoEm" < ${travadoAntesDe}
        AND NOT EXISTS (
          SELECT 1 FROM feedbacks f
          WHERE f."arteId" = l."arteId" AND f."criadoEm" >= l."criadoEm"
        )
        AND NOT EXISTS (
          SELECT 1 FROM aprovacoes a
          WHERE a."arteId" = l."arteId" AND a.status <> 'PENDENTE' AND a."deletedAt" IS NULL
        )
    `,

    prisma.saque.findMany({
      where: { status: 'SOLICITADO' },
      // O mais antigo primeiro: é quem está esperando há mais tempo.
      orderBy: { criadoEm: 'asc' },
      take: LIMITE_FILA,
      select: { id: true, valor: true, status: true, criadoEm: true, designer: { select: { nome: true } } },
    }),

    prisma.disputa.findMany({
      where: { status: { in: disputasPendentes } },
      orderBy: { criadoEm: 'asc' },
      take: LIMITE_FILA,
      select: { id: true, status: true, criadoEm: true, projeto: { select: { nome: true } } },
    }),

    prisma.usuario.findMany({
      orderBy: { criadoEm: 'desc' },
      take: LIMITE_USUARIOS_RECENTES,
      select: { id: true, nome: true, email: true, tipo: true, emailVerificado: true, criadoEm: true },
    }),
  ])

  const funil = funilBruto[0] ?? { criados: 0, abertos: 0, com_feedback: 0, com_decisao: 0 }

  const fila: ResumoAdmin['fila'] = [
    ...saques.map((s) => ({
      tipo: 'SAQUE' as const,
      id: s.id,
      // `valor` é em centavos no schema; dividir aqui evita que cada tela
      // redescubra isso — e uma delas esqueça.
      titulo: `${s.designer.nome} — ${dinheiro.format(s.valor / 100)}`,
      status: s.status,
      criadoEm: s.criadoEm,
      href: '/admin/saques',
    })),
    ...disputas.map((d) => ({
      tipo: 'DISPUTA' as const,
      id: d.id,
      titulo: d.projeto.nome,
      status: d.status,
      criadoEm: d.criadoEm,
      href: '/disputas',
    })),
  ]
    .sort((a, b) => a.criadoEm.getTime() - b.criadoEm.getTime())
    .slice(0, LIMITE_FILA)

  return {
    periodo: { fuso, inicioDoDia: desdeHoje, funilDesde, geradoEm },
    hoje: {
      contasNovas,
      projetosCriados,
      artesEnviadas,
      linksGerados,
      feedbacksCriados,
      aprovacoesSolicitadas,
      aprovacoesDecididas: null,
    },
    funil: {
      janelaDias: DIAS_DO_FUNIL,
      criados: funil.criados,
      abertos: funil.abertos,
      comFeedback: funil.com_feedback,
      comDecisao: funil.com_decisao,
    },
    precisaDeVoce: {
      saquesPendentes,
      disputasAbertas,
      linksTravados: travados[0]?.total ?? 0,
    },
    fila,
    usuariosRecentes,
  }
}
