import { randomBytes, createHash } from 'crypto'
import prisma from '../database/client.js'
import { Resend } from 'resend'
import { env } from '../config/env.js'

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null

const EXPIRACAO_MS = 7 * 24 * 60 * 60 * 1000 // 7 dias

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

async function sendEquipeConviteEmail(
  email: string,
  rawToken: string,
  nomeEquipe: string,
  nomeConvidadoPor: string,
  papel: string,
): Promise<void> {
  const link = `${env.FRONTEND_URL}/equipes/convites/${rawToken}`

  if (!resend) {
    console.info(`[EQUIPE_CONVITE] Link para ${email}: ${link}`)
    return
  }

  await resend.emails.send({
    from: env.EMAIL_FROM,
    to: email,
    subject: `${nomeConvidadoPor} convidou você para a equipe "${nomeEquipe}"`,
    html: `
      <p>Olá,</p>
      <p><strong>${nomeConvidadoPor}</strong> convidou você para participar da equipe <strong>"${nomeEquipe}"</strong> como <strong>${papel}</strong>.</p>
      <p>
        <a href="${link}" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;border-radius:6px;text-decoration:none">
          Ver convite
        </a>
      </p>
      <p>Este convite expira em 7 dias.</p>
      <p>Se você não esperava este convite, pode ignorar este e-mail.</p>
    `,
  })
}

export class EquipeConviteService {
  async criarConvite(
    equipeId: string,
    convidadoId: string,
    papel: string,
    convidadoPorId: string,
    isAdmin: boolean,
  ): Promise<string> {
    const papeis = ['LIDER', 'DESIGNER', 'REVISOR', 'CLIENTE']
    if (!papeis.includes(papel)) throw new Error(`Papel inválido. Use: ${papeis.join(', ')}`)

    const [equipe, convidado, convidadoPor] = await Promise.all([
      prisma.equipe.findUnique({ where: { id: equipeId }, select: { id: true, nome: true } }),
      prisma.usuario.findUnique({ where: { id: convidadoId }, select: { id: true, email: true, ativo: true } }),
      prisma.usuario.findUnique({ where: { id: convidadoPorId }, select: { id: true, nome: true } }),
    ])

    if (!equipe) throw new Error('Equipe não encontrada')
    if (!convidado || !convidado.ativo) throw new Error('Usuário convidado não encontrado ou inativo')

    // Somente líderes ou admins podem convidar
    if (!isAdmin) {
      const membro = await prisma.equipeMembro.findUnique({
        where: { equipeId_usuarioId: { equipeId, usuarioId: convidadoPorId } },
        select: { papel: true },
      })
      if (!membro || membro.papel !== 'LIDER') {
        throw new Error('Apenas líderes podem convidar membros para a equipe')
      }
    }

    // Verifica se já é membro
    const membroExistente = await prisma.equipeMembro.findUnique({
      where: { equipeId_usuarioId: { equipeId, usuarioId: convidadoId } },
    })
    if (membroExistente) throw new Error('Usuário já é membro desta equipe')

    // Cancela convites pendentes anteriores para o mesmo par equipe/convidado
    await prisma.equipeConvite.updateMany({
      where: { equipeId, convidadoId, status: 'PENDENTE' },
      data: { status: 'CANCELADO', respondidoEm: new Date() },
    })

    const rawToken = randomBytes(32).toString('hex')
    const tokenHash = hashToken(rawToken)
    const expiraEm = new Date(Date.now() + EXPIRACAO_MS)

    await prisma.equipeConvite.create({
      data: { equipeId, convidadoId, convidadoPorId, tokenHash, papel, expiraEm },
    })

    sendEquipeConviteEmail(
      convidado.email,
      rawToken,
      equipe.nome,
      convidadoPor?.nome ?? 'Alguém',
      papel,
    ).catch((err) => console.error('[EQUIPE_CONVITE] Falha ao enviar e-mail:', err))

    return rawToken
  }

  async aceitarConvite(rawToken: string, usuarioId: string) {
    const tokenHash = hashToken(rawToken)
    const convite = await prisma.equipeConvite.findUnique({
      where: { tokenHash },
      include: { equipe: { select: { id: true, nome: true } } },
    })

    if (!convite) throw new Error('Convite não encontrado ou inválido')
    if (convite.convidadoId !== usuarioId) throw new Error('Este convite não pertence a você')
    if (convite.status !== 'PENDENTE') throw new Error('Este convite já foi respondido')
    if (convite.expiraEm < new Date()) {
      await prisma.equipeConvite.update({
        where: { tokenHash },
        data: { status: 'EXPIRADO', respondidoEm: new Date() },
      })
      throw new Error('Este convite expirou')
    }

    // Verifica novamente se já é membro (pode ter sido adicionado diretamente)
    const membroExistente = await prisma.equipeMembro.findUnique({
      where: { equipeId_usuarioId: { equipeId: convite.equipeId, usuarioId } },
    })
    if (membroExistente) {
      await prisma.equipeConvite.update({
        where: { tokenHash },
        data: { status: 'CANCELADO', respondidoEm: new Date() },
      })
      throw new Error('Você já é membro desta equipe')
    }

    await prisma.$transaction([
      prisma.equipeConvite.update({
        where: { tokenHash },
        data: { status: 'ACEITO', respondidoEm: new Date() },
      }),
      prisma.equipeMembro.create({
        data: { equipeId: convite.equipeId, usuarioId, papel: convite.papel },
      }),
    ])

    return prisma.equipe.findUnique({
      where: { id: convite.equipeId },
      select: { id: true, nome: true, slug: true },
    })
  }

  async recusarConvite(rawToken: string, usuarioId: string) {
    const tokenHash = hashToken(rawToken)
    const convite = await prisma.equipeConvite.findUnique({ where: { tokenHash } })

    if (!convite) throw new Error('Convite não encontrado ou inválido')
    if (convite.convidadoId !== usuarioId) throw new Error('Este convite não pertence a você')
    if (convite.status !== 'PENDENTE') throw new Error('Este convite já foi respondido')

    await prisma.equipeConvite.update({
      where: { tokenHash },
      data: { status: 'RECUSADO', respondidoEm: new Date() },
    })
  }

  async listarConvitesPendentes(usuarioId: string) {
    // Marca expirados antes de listar
    await prisma.equipeConvite.updateMany({
      where: { convidadoId: usuarioId, status: 'PENDENTE', expiraEm: { lt: new Date() } },
      data: { status: 'EXPIRADO', respondidoEm: new Date() },
    })

    return prisma.equipeConvite.findMany({
      where: { convidadoId: usuarioId, status: 'PENDENTE' },
      include: {
        equipe: { select: { id: true, nome: true, slug: true } },
        convidadoPor: { select: { id: true, nome: true, email: true, tipo: true } },
      },
      orderBy: { criadoEm: 'desc' },
    })
  }

  async getConviteByToken(rawToken: string) {
    const tokenHash = hashToken(rawToken)
    return prisma.equipeConvite.findUnique({
      where: { tokenHash },
      include: {
        equipe: { select: { id: true, nome: true, slug: true } },
        convidadoPor: { select: { id: true, nome: true, tipo: true } },
        convidado: { select: { id: true, nome: true, tipo: true } },
      },
    })
  }

  async listarConvitesDaEquipe(equipeId: string, solicitanteId: string, isAdmin: boolean) {
    if (!isAdmin) {
      const membro = await prisma.equipeMembro.findUnique({
        where: { equipeId_usuarioId: { equipeId, usuarioId: solicitanteId } },
        select: { papel: true },
      })
      if (!membro || membro.papel !== 'LIDER') {
        throw new Error('Apenas líderes podem ver os convites da equipe')
      }
    }

    return prisma.equipeConvite.findMany({
      where: { equipeId },
      include: {
        convidado: { select: { id: true, nome: true, email: true, avatar: true } },
        convidadoPor: { select: { id: true, nome: true } },
      },
      orderBy: { criadoEm: 'desc' },
    })
  }
}

const _svc = new EquipeConviteService()
export const criarEquipeConvite = (...args: Parameters<EquipeConviteService['criarConvite']>) => _svc.criarConvite(...args)
export const aceitarEquipeConvite = (...args: Parameters<EquipeConviteService['aceitarConvite']>) => _svc.aceitarConvite(...args)
export const recusarEquipeConvite = (...args: Parameters<EquipeConviteService['recusarConvite']>) => _svc.recusarConvite(...args)
export const listarEquipeConvitesPendentes = (...args: Parameters<EquipeConviteService['listarConvitesPendentes']>) => _svc.listarConvitesPendentes(...args)
export const getEquipeConviteByToken = (...args: Parameters<EquipeConviteService['getConviteByToken']>) => _svc.getConviteByToken(...args)
export const listarConvitesDaEquipe = (...args: Parameters<EquipeConviteService['listarConvitesDaEquipe']>) => _svc.listarConvitesDaEquipe(...args)
