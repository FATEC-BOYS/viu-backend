import prisma from '../database/client.js'

const PAPEIS_VALIDOS = ['LIDER', 'DESIGNER', 'REVISOR', 'CLIENTE'] as const

export class EquipeService {
  async criarEquipe(donoPrincipalId: string, nome: string, slug: string) {
    const existing = await prisma.equipe.findUnique({ where: { slug } })
    if (existing) throw new Error('Slug já está em uso')

    return prisma.$transaction(async (tx) => {
      const equipe = await tx.equipe.create({ data: { nome, slug, donoPrincipalId } })
      await tx.equipeMembro.create({
        data: { equipeId: equipe.id, usuarioId: donoPrincipalId, papel: 'LIDER' },
      })
      return equipe
    })
  }

  async listarEquipes(usuarioId: string) {
    return prisma.equipe.findMany({
      where: {
        OR: [{ donoPrincipalId: usuarioId }, { membros: { some: { usuarioId } } }],
      },
      include: {
        donoPrincipal: { select: { id: true, nome: true, avatar: true } },
        _count: { select: { membros: true, projetos: true } },
      },
      orderBy: { criadoEm: 'desc' },
    })
  }

  async getEquipe(id: string, usuarioId: string, isAdmin = false) {
    const equipe = await prisma.equipe.findUnique({
      where: { id },
      include: {
        donoPrincipal: { select: { id: true, nome: true, avatar: true } },
        membros: {
          include: { usuario: { select: { id: true, nome: true, email: true, avatar: true, tipo: true } } },
          orderBy: { criadoEm: 'asc' },
        },
        projetos: { select: { id: true, nome: true, status: true } },
      },
    })
    if (!equipe) return null

    const isMembro = isAdmin || equipe.membros.some((m) => m.usuarioId === usuarioId)
    if (!isMembro) throw new Error('Acesso negado')

    return equipe
  }

  async atualizarEquipe(id: string, data: { nome?: string; slug?: string }, solicitanteId: string, isAdmin = false) {
    const equipe = await prisma.equipe.findUnique({ where: { id }, include: { membros: true } })
    if (!equipe) throw new Error('Equipe não encontrada')

    const papel = equipe.membros.find((m) => m.usuarioId === solicitanteId)?.papel
    if (!isAdmin && papel !== 'LIDER') throw new Error('Apenas líderes podem editar a equipe')

    if (data.slug && data.slug !== equipe.slug) {
      const conflict = await prisma.equipe.findUnique({ where: { slug: data.slug } })
      if (conflict) throw new Error('Slug já está em uso')
    }

    return prisma.equipe.update({ where: { id }, data })
  }

  async deletarEquipe(id: string, solicitanteId: string, isAdmin = false) {
    const equipe = await prisma.equipe.findUnique({ where: { id } })
    if (!equipe) throw new Error('Equipe não encontrada')

    if (!isAdmin && equipe.donoPrincipalId !== solicitanteId) {
      throw new Error('Apenas o dono pode excluir a equipe')
    }

    await prisma.equipe.delete({ where: { id } })
  }

  async adicionarMembro(equipeId: string, novoUsuarioId: string, papel: string, solicitanteId: string, isAdmin = false) {
    if (!PAPEIS_VALIDOS.includes(papel as any)) {
      throw new Error(`Papel inválido. Use: ${PAPEIS_VALIDOS.join(', ')}`)
    }

    const equipe = await prisma.equipe.findUnique({ where: { id: equipeId }, include: { membros: true } })
    if (!equipe) throw new Error('Equipe não encontrada')

    const papelSolicitante = equipe.membros.find((m) => m.usuarioId === solicitanteId)?.papel
    if (!isAdmin && papelSolicitante !== 'LIDER') throw new Error('Apenas líderes podem adicionar membros')

    if (equipe.membros.some((m) => m.usuarioId === novoUsuarioId)) {
      throw new Error('Usuário já é membro da equipe')
    }

    const usuario = await prisma.usuario.findUnique({ where: { id: novoUsuarioId } })
    if (!usuario) throw new Error('Usuário não encontrado')

    return prisma.equipeMembro.create({
      data: { equipeId, usuarioId: novoUsuarioId, papel },
      include: { usuario: { select: { id: true, nome: true, email: true, avatar: true } } },
    })
  }

  async removerMembro(equipeId: string, membroId: string, solicitanteId: string, isAdmin = false) {
    const equipe = await prisma.equipe.findUnique({ where: { id: equipeId }, include: { membros: true } })
    if (!equipe) throw new Error('Equipe não encontrada')

    if (membroId === equipe.donoPrincipalId) throw new Error('O dono da equipe não pode ser removido')

    const papelSolicitante = equipe.membros.find((m) => m.usuarioId === solicitanteId)?.papel
    if (!isAdmin && solicitanteId !== membroId && papelSolicitante !== 'LIDER') {
      throw new Error('Apenas líderes podem remover membros')
    }

    if (!equipe.membros.some((m) => m.usuarioId === membroId)) {
      throw new Error('Membro não encontrado na equipe')
    }

    await prisma.equipeMembro.delete({
      where: { equipeId_usuarioId: { equipeId, usuarioId: membroId } },
    })
  }

  async atualizarPapel(equipeId: string, membroId: string, papel: string, solicitanteId: string, isAdmin = false) {
    if (!PAPEIS_VALIDOS.includes(papel as any)) {
      throw new Error(`Papel inválido. Use: ${PAPEIS_VALIDOS.join(', ')}`)
    }

    const equipe = await prisma.equipe.findUnique({ where: { id: equipeId }, include: { membros: true } })
    if (!equipe) throw new Error('Equipe não encontrada')

    const papelSolicitante = equipe.membros.find((m) => m.usuarioId === solicitanteId)?.papel
    if (!isAdmin && papelSolicitante !== 'LIDER') throw new Error('Apenas líderes podem alterar papéis')

    if (membroId === equipe.donoPrincipalId) throw new Error('Não é possível alterar o papel do dono da equipe')

    if (!equipe.membros.some((m) => m.usuarioId === membroId)) {
      throw new Error('Membro não encontrado na equipe')
    }

    return prisma.equipeMembro.update({
      where: { equipeId_usuarioId: { equipeId, usuarioId: membroId } },
      data: { papel },
    })
  }

  async vincularProjeto(equipeId: string, projetoId: string, solicitanteId: string, isAdmin = false) {
    const equipe = await prisma.equipe.findUnique({ where: { id: equipeId }, include: { membros: true } })
    if (!equipe) throw new Error('Equipe não encontrada')

    const papelSolicitante = equipe.membros.find((m) => m.usuarioId === solicitanteId)?.papel
    if (!isAdmin && papelSolicitante !== 'LIDER') throw new Error('Apenas líderes podem vincular projetos')

    const projeto = await prisma.projeto.findUnique({ where: { id: projetoId } })
    if (!projeto) throw new Error('Projeto não encontrado')

    if (!isAdmin && projeto.designerId !== solicitanteId && projeto.clienteId !== solicitanteId) {
      throw new Error('Você não tem permissão sobre este projeto')
    }

    return prisma.projeto.update({ where: { id: projetoId }, data: { equipeId } })
  }

  async desvincularProjeto(equipeId: string, projetoId: string, solicitanteId: string, isAdmin = false) {
    const projeto = await prisma.projeto.findUnique({ where: { id: projetoId } })
    if (!projeto) throw new Error('Projeto não encontrado')
    if (projeto.equipeId !== equipeId) throw new Error('Projeto não pertence a esta equipe')

    if (!isAdmin && projeto.designerId !== solicitanteId && projeto.clienteId !== solicitanteId) {
      throw new Error('Você não tem permissão sobre este projeto')
    }

    return prisma.projeto.update({ where: { id: projetoId }, data: { equipeId: null } })
  }

  /** Retorna true se o usuário é dono ou membro da equipe. */
  async isMembro(equipeId: string, usuarioId: string): Promise<boolean> {
    const result = await prisma.equipe.findFirst({
      where: {
        id: equipeId,
        OR: [
          { donoPrincipalId: usuarioId },
          { membros: { some: { usuarioId } } },
        ],
      },
      select: { id: true },
    })
    return result !== null
  }
}

const _svc = new EquipeService()
export const criarEquipe = (...args: Parameters<EquipeService['criarEquipe']>) => _svc.criarEquipe(...args)
export const listarEquipes = (...args: Parameters<EquipeService['listarEquipes']>) => _svc.listarEquipes(...args)
export const getEquipe = (...args: Parameters<EquipeService['getEquipe']>) => _svc.getEquipe(...args)
export const atualizarEquipe = (...args: Parameters<EquipeService['atualizarEquipe']>) => _svc.atualizarEquipe(...args)
export const deletarEquipe = (...args: Parameters<EquipeService['deletarEquipe']>) => _svc.deletarEquipe(...args)
export const adicionarMembro = (...args: Parameters<EquipeService['adicionarMembro']>) => _svc.adicionarMembro(...args)
export const removerMembro = (...args: Parameters<EquipeService['removerMembro']>) => _svc.removerMembro(...args)
export const atualizarPapel = (...args: Parameters<EquipeService['atualizarPapel']>) => _svc.atualizarPapel(...args)
export const vincularProjeto = (...args: Parameters<EquipeService['vincularProjeto']>) => _svc.vincularProjeto(...args)
export const desvincularProjeto = (...args: Parameters<EquipeService['desvincularProjeto']>) => _svc.desvincularProjeto(...args)
export const isMembroEquipe = (...args: Parameters<EquipeService['isMembro']>) => _svc.isMembro(...args)
