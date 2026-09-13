import prisma from '../database/client.js'
import {
  TEXTO_TERMOS,
  TERMOS_VERSAO,
  TERMOS_REVISADOS_JURIDICAMENTE,
  HASH_TERMOS,
} from '../templates/termosPlataforma.js'

/**
 * O aceite dos termos da plataforma — o que faltava para o aceite deixar de
 * ser fantasma.
 *
 * O que havia: `projetoController` gravava um `AceiteContratual` quando o corpo
 * trazia `aceiteTermos: true`, com `termoVersao: "1.0"` apontando para nada, e
 * nenhuma tela lia de volta. Três defeitos numa linha só — documento
 * inexistente, momento errado (os termos regem a conta, não o projeto) e
 * registro que ninguém consultava.
 *
 * O que passa a haver: texto versionado no repositório, hash do que foi lido, e
 * o aceite no cadastro, que é onde a relação com o VIU começa.
 */

export interface TermosVigentes {
  versao: string
  texto: string
  hash: string
  /** Falso enquanto o texto não passar por advogado. A tela lê daqui. */
  revisadoJuridicamente: boolean
}

/** O texto vigente, para a tela de leitura e para o cadastro. */
export function termosVigentes(): TermosVigentes {
  return {
    versao: TERMOS_VERSAO,
    texto: TEXTO_TERMOS,
    hash: HASH_TERMOS,
    revisadoJuridicamente: TERMOS_REVISADOS_JURIDICAMENTE,
  }
}

export interface RegistrarAceiteTermosInput {
  usuarioId: string
  ip?: string
  userAgent?: string
}

/**
 * Grava o aceite da versão vigente.
 *
 * `create` protegido por unicidade, e não `upsert`: aceite é fato histórico e
 * não se atualiza — foi exatamente o `upsert` que apagava a prova anterior no
 * fluxo do contrato de projeto. Clicar duas vezes na mesma versão é o mesmo
 * fato, então a colisão é ignorada; uma versão NOVA cria linha nova e a antiga
 * fica.
 */
export async function registrarAceiteTermos(data: RegistrarAceiteTermosInput) {
  try {
    return await prisma.aceiteTermos.create({
      data: {
        usuarioId: data.usuarioId,
        versao: TERMOS_VERSAO,
        hash: HASH_TERMOS,
        ip: data.ip,
        userAgent: data.userAgent,
      },
    })
  } catch (erro: any) {
    // P2002 = já aceitou esta versão. Repetir não é erro.
    if (erro?.code === 'P2002') {
      return prisma.aceiteTermos.findFirst({
        where: { usuarioId: data.usuarioId, versao: TERMOS_VERSAO },
      })
    }
    throw erro
  }
}

export interface EstadoAceiteTermos {
  /** Aceitou a versão que está no ar AGORA. */
  aceitouVigente: boolean
  /** A versão que a pessoa aceitou por último, se alguma. */
  versaoAceita: string | null
  aceitoEm: Date | null
  versaoVigente: string
}

/**
 * O que esta pessoa aceitou, comparado com o que está no ar.
 *
 * A comparação é por versão e não por "existe alguma linha": quando a redação
 * mudar, quem aceitou a anterior precisa aceitar de novo, e um booleano
 * solitário esconderia isso. É o mesmo raciocínio do reaceite por versão do
 * contrato de projeto.
 */
export async function estadoAceiteTermos(usuarioId: string): Promise<EstadoAceiteTermos> {
  const ultimo = await prisma.aceiteTermos.findFirst({
    where: { usuarioId },
    orderBy: { criadoEm: 'desc' },
  })

  return {
    aceitouVigente: ultimo?.versao === TERMOS_VERSAO,
    versaoAceita: ultimo?.versao ?? null,
    aceitoEm: ultimo?.criadoEm ?? null,
    versaoVigente: TERMOS_VERSAO,
  }
}
