import prisma from '../database/client.js'

/**
 * O aceite registrado na criação do projeto — caminho legado.
 *
 * ATENÇÃO AO QUE ESTE SERVIÇO É E AO QUE NÃO É.
 *
 * Ele grava que alguém marcou "aceito os termos" ao criar um projeto, com IP,
 * user-agent e data. Não existe texto por trás: `termoVersao` guardava um
 * rótulo ("1.0") apontando para um documento que nunca foi preservado em lugar
 * nenhum. Dá para provar que a pessoa clicou; não dá para provar o que ela leu.
 *
 * O aceite do ANEXO DO PROJETO — com texto congelado e hash — é outro fluxo, em
 * `contratoProjetoService`. São dois documentos diferentes e o produto os
 * confundia: o que se aceita ao criar um projeto são os termos da plataforma,
 * e o que rege escopo, rodadas e propriedade intelectual é o anexo, que nem
 * existe no momento da criação.
 *
 * Este arquivo fica enquanto o aceite dos termos da plataforma não tiver o
 * próprio lugar.
 */

export interface RegistrarAceiteInput {
  usuarioId: string
  projetoId: string
  termoVersao?: string
  ip?: string
  userAgent?: string
}

export class AceiteService {
  /**
   * Grava o aceite se ainda não houver um.
   *
   * Era `upsert` com `update`, o que sobrescrevia a linha anterior — trocava
   * versão, IP e data — e apagava a prova do aceite anterior. Aceite é fato
   * histórico: não se atualiza. Aqui ele passou a ser criar-se-não-existe, que
   * mantém a idempotência sem destruir o que já estava gravado.
   */
  async registrarAceite(data: RegistrarAceiteInput) {
    const existente = await prisma.aceiteContratual.findFirst({
      // `contratoId: null` delimita o caminho legado: aceites do anexo vivem
      // amarrados a uma versão de contrato e são gravados pelo outro serviço.
      where: { usuarioId: data.usuarioId, projetoId: data.projetoId, contratoId: null },
    })
    if (existente) return existente

    return prisma.aceiteContratual.create({
      data: {
        usuarioId: data.usuarioId,
        projetoId: data.projetoId,
        termoVersao: data.termoVersao ?? '1.0',
        ip: data.ip,
        userAgent: data.userAgent,
      },
      include: {
        usuario: { select: { id: true, nome: true, email: true } },
        projeto: { select: { id: true, nome: true } },
      },
    })
  }

  async verificarAceite(usuarioId: string, projetoId: string) {
    return prisma.aceiteContratual.findFirst({
      where: { usuarioId, projetoId, contratoId: null },
      orderBy: { criadoEm: 'desc' },
    })
  }

  /** Todos os aceites do projeto — inclusive os do anexo, que têm contrato. */
  async listarAceitesPorProjeto(projetoId: string) {
    return prisma.aceiteContratual.findMany({
      where: { projetoId },
      include: {
        usuario: { select: { id: true, nome: true, email: true, tipo: true } },
        contrato: { select: { id: true, versao: true, templateVersao: true } },
      },
      orderBy: { criadoEm: 'asc' },
    })
  }
}
