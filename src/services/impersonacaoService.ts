import { randomUUID, randomBytes } from 'crypto'
import { SignJWT } from 'jose'
import prisma from '../database/client.js'
import { getJWTSecret, env } from '../config/env.js'
import { parseJwtExpiry } from '../utils/jwt.js'

/**
 * Entrar na conta de outra pessoa — SOMENTE LEITURA.
 *
 * Suporte precisa ver o que o usuário vê, e descrever tela por telefone não
 * funciona. O que não pode é escrever.
 *
 * O motivo é específico deste produto. O VIU vende registro: aceite com hash do
 * texto lido, IP e user-agent; aprovação com data e hora; feedback carimbado
 * com a versão. Se o admin pudesse entrar como o cliente e clicar em "Aprovar"
 * ou "Li e aceito", esses registros deixariam de provar que foi o CLIENTE — e
 * não só os novos: a defesa "o VIU tem acesso à minha conta" passaria a valer
 * para tudo que já está gravado, porque a capacidade passaria a existir.
 *
 * Por isso a leitura-apenas não é limitação temporária desta versão. É a
 * definição da coisa, e `authenticate` a impõe recusando qualquer método que
 * não seja seguro — negação por padrão, para que rota criada depois já nasça
 * bloqueada.
 *
 * O que o suporte precisa FAZER continua existindo fora daqui: as rotas de
 * admin para disputa, saque e plano agem em nome do admin, com o nome e a data
 * certos.
 */

/**
 * Prazo curto, e mais curto que o da sessão normal: é acesso ao dado de outra
 * pessoa, e sessão esquecida aberta é o modo mais comum de isso virar problema.
 */
const IMPERSONACAO_EXPIRA_EM = '30m'

async function assinarToken(usuario: { id: string; email: string; nome: string; tipo: string }, expiraEm: string) {
  const secret = new TextEncoder().encode(getJWTSecret())
  const expiresAt = parseJwtExpiry(expiraEm)
  const token = await new SignJWT({ email: usuario.email, nome: usuario.nome, tipo: usuario.tipo })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(usuario.id)
    .setExpirationTime(expiraEm)
    .setIssuedAt()
    .setJti(randomUUID())
    .sign(secret)
  return { token, expiresAt }
}

export interface SessaoEmitida {
  token: string
  refreshToken: string
  expiresAt: Date
  refreshExpiresAt: Date
  usuario: { id: string; email: string; nome: string; tipo: string }
}

/**
 * Abre a sessão de impersonação.
 *
 * O refresh nasce já vencido de propósito: renovar prolongaria em silêncio um
 * acesso que deve durar meia hora e acabar. Quem precisar de mais tempo entra
 * de novo — e a entrada nova aparece na auditoria, que é o ponto.
 */
export async function entrarComo(
  adminId: string,
  alvoId: string,
): Promise<SessaoEmitida> {
  const admin = await prisma.usuario.findUnique({ where: { id: adminId } })
  if (!admin || admin.tipo !== 'ADMIN') throw new Error('Acesso negado')

  const alvo = await prisma.usuario.findUnique({ where: { id: alvoId } })
  if (!alvo) throw new Error('Usuário não encontrado')

  /*
   * Nunca sobre outro ADMIN. Sem esta linha, quem tivesse o papel poderia
   * entrar na conta de outro admin e, de lá, usar as rotas administrativas
   * como ele — escalada de privilégio com o rastro apontando para a pessoa
   * errada.
   */
  if (alvo.tipo === 'ADMIN') throw new Error('Não é possível entrar na conta de outro administrador')
  if (!alvo.ativo) throw new Error('Conta inativa')

  const { token, expiresAt } = await assinarToken(alvo, IMPERSONACAO_EXPIRA_EM)

  await prisma.sessao.create({
    data: {
      token,
      expiresAt,
      usuarioId: alvo.id,
      impersonadoPorId: admin.id,
      refreshToken: randomBytes(32).toString('hex'),
      refreshExpiresAt: new Date(0),
    },
  })

  return {
    token,
    refreshToken: '',
    expiresAt,
    refreshExpiresAt: new Date(0),
    usuario: { id: alvo.id, email: alvo.email, nome: alvo.nome, tipo: alvo.tipo },
  }
}

/**
 * Fecha a impersonação e devolve o admin à própria conta.
 *
 * Revoga a sessão de impersonação e emite uma nova para o admin, em vez de
 * tentar restaurar a que ele tinha antes: guardar o token anterior para
 * devolver depois seria mais uma cópia de credencial viva por aí, e o admin já
 * está identificado em `impersonadoPorId`.
 */
export async function sairDaImpersonacao(token: string): Promise<SessaoEmitida> {
  const sessao = await prisma.sessao.findFirst({
    where: { token, ativo: true },
    select: { id: true, impersonadoPorId: true },
  })
  if (!sessao?.impersonadoPorId) throw new Error('Esta sessão não é uma impersonação')

  const admin = await prisma.usuario.findUnique({ where: { id: sessao.impersonadoPorId } })
  if (!admin) throw new Error('Administrador não encontrado')

  const { token: novoToken, expiresAt } = await assinarToken(admin, env.JWT_EXPIRES_IN)
  const refreshToken = randomBytes(32).toString('hex')
  const refreshExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7)

  await prisma.$transaction([
    prisma.sessao.update({ where: { id: sessao.id }, data: { ativo: false } }),
    prisma.sessao.create({
      data: { token: novoToken, expiresAt, usuarioId: admin.id, refreshToken, refreshExpiresAt },
    }),
  ])

  return {
    token: novoToken,
    refreshToken,
    expiresAt,
    refreshExpiresAt,
    usuario: { id: admin.id, email: admin.email, nome: admin.nome, tipo: admin.tipo },
  }
}
