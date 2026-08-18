import { randomBytes, createHash } from 'crypto'
import prisma from '../database/client.js'
import { Resend } from 'resend'
import { env } from '../config/env.js'

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null

const EXPIRACAO_MS = 7 * 24 * 60 * 60 * 1000 // 7 dias

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

async function sendConviteEmail(
  email: string,
  rawToken: string,
  nomeProjeto: string,
  nomeConvidadoPor: string,
): Promise<void> {
  const link = `${env.FRONTEND_URL}/convites/${rawToken}`

  if (!resend) {
    console.info(`[CONVITE] Link para ${email}: ${link}`)
    return
  }

  await resend.emails.send({
    from: env.EMAIL_FROM,
    to: email,
    subject: `${nomeConvidadoPor} convidou você para o projeto "${nomeProjeto}"`,
    html: `
      <p>Olá,</p>
      <p><strong>${nomeConvidadoPor}</strong> convidou você para participar do projeto <strong>"${nomeProjeto}"</strong>.</p>
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

export class ConviteService {
  async criarConvite(
    projetoId: string,
    convidadoId: string,
    convidadoPorId: string,
  ): Promise<string> {
    const [projeto, convidado, convidadoPor] = await Promise.all([
      prisma.projeto.findUnique({ where: { id: projetoId }, select: { nome: true, status: true } }),
      prisma.usuario.findUnique({ where: { id: convidadoId }, select: { id: true, email: true, ativo: true } }),
      prisma.usuario.findUnique({ where: { id: convidadoPorId }, select: { nome: true } }),
    ])

    if (!projeto) throw new Error('Projeto não encontrado')
    if (projeto.status !== 'RASCUNHO') throw new Error('Convite só pode ser criado para projetos em rascunho')
    if (!convidado) throw new Error('Usuário convidado não encontrado')
    if (!convidado.ativo) throw new Error('Usuário convidado está inativo')

    // Cancela convite pendente anterior para o mesmo projeto/usuário
    await prisma.conviteProjeto.updateMany({
      where: { projetoId, convidadoId, status: 'PENDENTE' },
      data: { status: 'CANCELADO', respondidoEm: new Date() },
    })

    const rawToken = randomBytes(32).toString('hex')
    const tokenHash = hashToken(rawToken)
    const expiraEm = new Date(Date.now() + EXPIRACAO_MS)

    await prisma.conviteProjeto.create({
      data: { projetoId, convidadoId, convidadoPorId, tokenHash, expiraEm },
    })

    sendConviteEmail(convidado.email, rawToken, projeto.nome, convidadoPor?.nome ?? 'Alguém').catch(
      (err) => console.error('[CONVITE] Falha ao enviar e-mail:', err),
    )

    return rawToken
  }

  async aceitarConvite(rawToken: string, usuarioId: string) {
    const tokenHash = hashToken(rawToken)
    const convite = await prisma.conviteProjeto.findUnique({
      where: { tokenHash },
      include: { projeto: { select: { id: true, nome: true, status: true } } },
    })

    if (!convite) throw new Error('Convite não encontrado ou inválido')
    if (convite.convidadoId !== usuarioId) throw new Error('Este convite não pertence a você')
    if (convite.status !== 'PENDENTE') throw new Error('Este convite já foi respondido')
    if (convite.expiraEm < new Date()) {
      await prisma.conviteProjeto.update({
        where: { tokenHash },
        data: { status: 'EXPIRADO', respondidoEm: new Date() },
      })
      throw new Error('Este convite expirou')
    }
    if (convite.projeto.status !== 'RASCUNHO') {
      throw new Error('O projeto associado a este convite não está mais aguardando confirmação')
    }

    await prisma.$transaction([
      prisma.conviteProjeto.update({
        where: { tokenHash },
        data: { status: 'ACEITO', respondidoEm: new Date() },
      }),
      prisma.projeto.update({
        where: { id: convite.projetoId },
        data: { status: 'EM_ANDAMENTO' },
      }),
    ])

    return prisma.projeto.findUnique({
      where: { id: convite.projetoId },
      select: { id: true, nome: true, status: true },
    })
  }

  async recusarConvite(rawToken: string, usuarioId: string) {
    const tokenHash = hashToken(rawToken)
    const convite = await prisma.conviteProjeto.findUnique({
      where: { tokenHash },
      include: { projeto: { select: { id: true, status: true } } },
    })

    if (!convite) throw new Error('Convite não encontrado ou inválido')
    if (convite.convidadoId !== usuarioId) throw new Error('Este convite não pertence a você')
    if (convite.status !== 'PENDENTE') throw new Error('Este convite já foi respondido')

    await prisma.$transaction([
      prisma.conviteProjeto.update({
        where: { tokenHash },
        data: { status: 'RECUSADO', respondidoEm: new Date() },
      }),
      prisma.projeto.update({
        where: { id: convite.projetoId },
        data: { status: 'CANCELADO' },
      }),
    ])
  }

  async listarConvitesPendentes(usuarioId: string) {
    // Marca expirados antes de listar
    await prisma.conviteProjeto.updateMany({
      where: { convidadoId: usuarioId, status: 'PENDENTE', expiraEm: { lt: new Date() } },
      data: { status: 'EXPIRADO', respondidoEm: new Date() },
    })

    return prisma.conviteProjeto.findMany({
      where: { convidadoId: usuarioId, status: 'PENDENTE' },
      include: {
        projeto: { select: { id: true, nome: true, descricao: true } },
        convidadoPor: { select: { id: true, nome: true, email: true, tipo: true } },
      },
      orderBy: { criadoEm: 'desc' },
    })
  }

  async getConviteByToken(rawToken: string) {
    const tokenHash = hashToken(rawToken)
    return prisma.conviteProjeto.findUnique({
      where: { tokenHash },
      include: {
        projeto: { select: { id: true, nome: true, descricao: true } },
        convidadoPor: { select: { id: true, nome: true, tipo: true } },
        convidado: { select: { id: true, nome: true, tipo: true } },
      },
    })
  }
}

const _svc = new ConviteService()
export const criarConvite = (...args: Parameters<ConviteService['criarConvite']>) => _svc.criarConvite(...args)
export const aceitarConvite = (...args: Parameters<ConviteService['aceitarConvite']>) => _svc.aceitarConvite(...args)
export const recusarConvite = (...args: Parameters<ConviteService['recusarConvite']>) => _svc.recusarConvite(...args)
export const listarConvitesPendentes = (...args: Parameters<ConviteService['listarConvitesPendentes']>) => _svc.listarConvitesPendentes(...args)
export const getConviteByToken = (...args: Parameters<ConviteService['getConviteByToken']>) => _svc.getConviteByToken(...args)

/**
 * Convites de um projeto, para a aba de pessoas.
 *
 * O acesso já é checado por requireProjectAccess na rota; aqui só listamos.
 * O tokenHash nunca sai — o token cru não é persistido e o hash não serve
 * para nada do lado do cliente.
 */
export async function listarConvitesDoProjeto(projetoId: string) {
  return prisma.conviteProjeto.findMany({
    where: { projetoId },
    select: {
      id: true,
      status: true,
      expiraEm: true,
      criadoEm: true,
      respondidoEm: true,
      convidado: { select: { id: true, nome: true, email: true, avatar: true } },
      convidadoPor: { select: { id: true, nome: true } },
    },
    orderBy: { criadoEm: 'desc' },
  })
}
