import prisma from '../database/client.js'

export interface ListSessoesParams {
  usuarioId: string
  currentToken?: string
  ativo?: string | boolean
}

export class SessaoService {
  async listSessoes({ usuarioId, currentToken, ativo }: ListSessoesParams) {
    let ativoFilter: boolean | undefined
    if (ativo !== undefined) {
      if (typeof ativo === 'string') ativoFilter = ativo === 'true'
      else ativoFilter = ativo
    }
    const where: any = {
      usuarioId,
      ...(ativoFilter !== undefined && { ativo: ativoFilter }),
    }
    const sessoes = await prisma.sessao.findMany({
      where,
      orderBy: { criadoEm: 'desc' },
      select: { id: true, ativo: true, expiresAt: true, criadoEm: true, token: true },
    })

    return sessoes.map(({ token, ...s }) => ({
      ...s,
      isCurrent: currentToken ? token === currentToken : false,
    }))
  }

  async getSessaoById(id: string) {
    return prisma.sessao.findUnique({ where: { id }, include: { usuario: true } })
  }

  async revokeSessao(id: string) {
    const existing = await prisma.sessao.findUnique({ where: { id } })
    if (!existing) throw new Error('Sessão não encontrada')
    return prisma.sessao.update({ where: { id }, data: { ativo: false } })
  }

  async revokeOtherSessoes(usuarioId: string, currentToken: string) {
    return prisma.sessao.updateMany({
      where: { usuarioId, ativo: true, NOT: { token: currentToken } },
      data: { ativo: false },
    })
  }
}
