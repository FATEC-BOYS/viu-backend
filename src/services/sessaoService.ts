// src/services/sessaoService.ts
/**
 * Serviço de Sessões
 *
 * Gerencia tokens de sessão utilizados na autenticação. Permite listar
 * sessões de um usuário e revogar tokens quando necessário.
 */

import prisma from '../database/client.js'

export interface ListSessoesParams {
  usuarioId: string
  ativo?: string | boolean
}

export class SessaoService {
  async listSessoes({ usuarioId, ativo }: ListSessoesParams) {
    let ativoFilter: boolean | undefined
    if (ativo !== undefined) {
      if (typeof ativo === 'string') ativoFilter = ativo === 'true'
      else ativoFilter = ativo
    }
    const where: any = {
      usuarioId,
      ...(ativoFilter !== undefined && { ativo: ativoFilter }),
    }
    return prisma.sessao.findMany({ where, orderBy: { criadoEm: 'desc' } })
  }
  async getSessaoById(id: string) {
    return prisma.sessao.findUnique({ where: { id }, include: { usuario: true } })
  }
  async revokeSessao(id: string) {
    const existing = await prisma.sessao.findUnique({ where: { id } })
    if (!existing) throw new Error('Sessão não encontrada')
    return prisma.sessao.update({ where: { id }, data: { ativo: false } })
  }
}