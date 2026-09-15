import crypto from 'crypto'
import { Resend } from 'resend'
import { prisma } from '../database/client.js'
import { env } from '../config/env.js'

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex')
}

export async function sendVerificationEmail(usuarioId: string, email: string): Promise<void> {
  const rawToken = crypto.randomBytes(32).toString('hex')
  const hashed = hashToken(rawToken)
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24h

  await prisma.usuario.update({
    where: { id: usuarioId },
    data: { emailVerificacaoToken: hashed, emailVerificacaoExpiresAt: expiresAt },
  })

  const link = `${env.FRONTEND_URL}/verificar-email?token=${rawToken}`

  if (!resend) {
    console.info(`[EMAIL VERIFICATION] Link para ${email}: ${link}`)
    return
  }

  await resend.emails.send({
    from: env.EMAIL_FROM,
    to: email,
    subject: 'Confirme seu e-mail — VIU',
    html: `
      <p>Olá,</p>
      <p>Confirme seu endereço de e-mail clicando no link abaixo. O link é válido por 24 horas.</p>
      <p><a href="${link}">Confirmar e-mail</a></p>
      <p>Se você não criou uma conta no VIU, ignore este e-mail.</p>
    `,
  })
}

/**
 * O aviso para quem NÃO pediu a conta.
 *
 * Quando o designer cadastra o cliente pelo wizard, a conta nasce sem que a
 * pessoa tenha feito nada — e o e-mail que ela recebia era o de verificação
 * comum: "Olá, confirme seu endereço. Se você não criou uma conta no VIU,
 * ignore este e-mail."
 *
 * Aquela última linha era má orientação justamente no caso dela: ela não
 * criou, e ignorar não desfaz nada — a conta continua lá com o nome e o
 * telefone dela, e passa a receber convite de projeto. O e-mail também nunca
 * dizia QUEM a adicionou nem POR QUÊ, o que faz uma mensagem legítima parecer
 * golpe.
 *
 * Este aqui diz as três coisas que faltavam: quem, por quê, e o que fazer.
 * Ele reaproveita o token de verificação porque a conta nasce com uma senha
 * aleatória que ninguém conhece — confirmar o e-mail é o que abre o caminho
 * para ela definir a própria senha.
 */
export async function sendAvisoDeContaCriadaPorTerceiro(
  usuarioId: string,
  email: string,
  quemAdicionou: { nome: string; email: string },
): Promise<void> {
  const rawToken = crypto.randomBytes(32).toString('hex')
  const hashed = hashToken(rawToken)
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

  await prisma.usuario.update({
    where: { id: usuarioId },
    data: { emailVerificacaoToken: hashed, emailVerificacaoExpiresAt: expiresAt },
  })

  const link = `${env.FRONTEND_URL}/verificar-email?token=${rawToken}`
  const definirSenha = `${env.FRONTEND_URL}/recuperar?email=${encodeURIComponent(email)}`

  if (!resend) {
    console.info(
      `[CONTA CRIADA POR TERCEIRO] ${quemAdicionou.nome} cadastrou ${email} — link: ${link}`,
    )
    return
  }

  await resend.emails.send({
    from: env.EMAIL_FROM,
    to: email,
    subject: `${quemAdicionou.nome} cadastrou você no VIU`,
    html: `
      <p>Olá,</p>
      <p>
        <strong>${quemAdicionou.nome}</strong> (${quemAdicionou.email}) cadastrou você
        como cliente no VIU — a ferramenta onde ele envia as artes para você aprovar.
      </p>
      <p>Você ainda não tem senha. Para acessar:</p>
      <p><a href="${link}">Confirmar meu e-mail</a> e depois <a href="${definirSenha}">definir minha senha</a>.</p>
      <p>
        Não conhece ${quemAdicionou.nome} ou não quer essa conta? Responda este e-mail
        e nós removemos os seus dados.
      </p>
    `,
  })
}

export async function verifyEmail(rawToken: string): Promise<void> {
  const hashed = hashToken(rawToken)

  const usuario = await prisma.usuario.findFirst({
    where: {
      emailVerificacaoToken: hashed,
      emailVerificacaoExpiresAt: { gt: new Date() },
    },
    select: { id: true, emailVerificado: true },
  })

  if (!usuario) {
    throw new Error('Token inválido ou expirado')
  }

  if (usuario.emailVerificado) {
    return // idempotente — já verificado
  }

  await prisma.usuario.update({
    where: { id: usuario.id },
    data: {
      emailVerificado: true,
      emailVerificacaoToken: null,
      emailVerificacaoExpiresAt: null,
    },
  })
}

export async function resendVerificationEmail(email: string): Promise<void> {
  const usuario = await prisma.usuario.findUnique({
    where: { email },
    select: { id: true, emailVerificado: true },
  })

  // Sempre retorna sem revelar se o email existe
  if (!usuario || usuario.emailVerificado) return

  await sendVerificationEmail(usuario.id, email)
}
