import crypto from 'crypto'
import prisma from '../database/client.js'
import { UsuarioService } from './usuarioService.js'
import { notificacaoService } from './notificacaoService.js'

/**
 * "Não fui eu" — a saída de quem foi cadastrado sem pedir.
 *
 * Quando o designer cadastra o cliente pelo wizard, a conta nasce por decisão
 * de outra pessoa. O e-mail que ela recebe diz quem fez e por quê; isto aqui é
 * o que transforma a promessa "responda que a gente remove" em botão — porque
 * caixa de entrada de suporte não escala e não é resposta de LGPD.
 *
 * A regra, e o porquê de cada linha:
 *
 *   - Só remove sozinho conta que NUNCA foi usada: e-mail não verificado e
 *     nenhuma atividade forte. Se a pessoa entrou e usou, quem clica no link
 *     pode ser qualquer um que alcançou o e-mail dela, e apagar seria pior que
 *     o problema original.
 *
 *   - "Atividade forte" é o que outra pessoa perderia junto: comentário,
 *     decisão de aprovação, pagamento. Não entra aqui ter sido posto num
 *     projeto — isso é decisão do designer, não da pessoa.
 *
 *   - Estar em projeto NÃO impede a saída, mas não desfaz o projeto. O
 *     `Projeto.clienteId` é obrigatório com FK: não há como "tirar do projeto"
 *     sem inventar um cliente vazio. O projeto continua apontando para a conta
 *     desativada, e o designer é avisado de que a pessoa recusou — é ele quem
 *     decide o que fazer com o trabalho. Afrouxar isso é o convite-sem-conta,
 *     anotado em TECH_DEBT.
 */

export type MotivoRecusaBloqueada = 'ATIVIDADE_REAL' | 'CONTA_EM_USO'

export class RecusaBloqueadaError extends Error {
  readonly codigo = 'RECUSA_BLOQUEADA'
  constructor(readonly motivo: MotivoRecusaBloqueada, mensagem: string) {
    super(mensagem)
    this.name = 'RecusaBloqueadaError'
  }
}

export class TokenDeRecusaInvalidoError extends Error {
  readonly codigo = 'TOKEN_INVALIDO'
  constructor() {
    super('Este link não vale mais. Se você não reconhece esta conta, fale com o suporte.')
    this.name = 'TokenDeRecusaInvalidoError'
  }
}

const VALIDADE_MS = 7 * 24 * 60 * 60 * 1000

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex')
}

/** Gera o token que vai no e-mail de "fulano cadastrou você". */
export async function criarTokenDeRecusa(usuarioId: string): Promise<string> {
  const rawToken = crypto.randomBytes(32).toString('hex')

  await prisma.usuario.update({
    where: { id: usuarioId },
    data: {
      recusaCadastroToken: hashToken(rawToken),
      recusaCadastroExpiraEm: new Date(Date.now() + VALIDADE_MS),
    },
  })

  return rawToken
}

/**
 * O que a pessoa já fez na conta — e que se perderia junto com ela.
 *
 * Aprovação PENDENTE não conta: ela foi criada pelo designer pedindo a
 * decisão, não pela pessoa tomando uma.
 */
async function temAtividadeReal(usuarioId: string): Promise<boolean> {
  const [feedbacks, decisoes, pagamentos] = await Promise.all([
    prisma.feedback.count({ where: { autorId: usuarioId } }),
    prisma.aprovacao.count({
      where: { aprovadorId: usuarioId, status: { in: ['APROVADO', 'REJEITADO'] } },
    }),
    prisma.pagamento.count({ where: { usuarioId } }),
  ])

  return feedbacks > 0 || decisoes > 0 || pagamentos > 0
}

export type ResultadoDaRecusa = {
  projetosAfetados: { id: string; nome: string; designerId: string }[]
}

export async function recusarCadastro(rawToken: string): Promise<ResultadoDaRecusa> {
  const usuario = await prisma.usuario.findFirst({
    where: { recusaCadastroToken: hashToken(rawToken) },
    select: {
      id: true,
      ativo: true,
      excluidoEm: true,
      emailVerificado: true,
      recusaCadastroExpiraEm: true,
    },
  })

  if (!usuario || !usuario.recusaCadastroExpiraEm || usuario.recusaCadastroExpiraEm < new Date()) {
    throw new TokenDeRecusaInvalidoError()
  }
  // Já saiu — repetir o clique não é erro, mas também não há o que fazer.
  if (!usuario.ativo || usuario.excluidoEm) {
    throw new TokenDeRecusaInvalidoError()
  }

  /*
   * E-mail verificado significa que alguém com acesso à caixa entrou e
   * confirmou. Daí em diante a conta é de quem a usa, e "não fui eu" deixa de
   * ser autoatendimento.
   */
  if (usuario.emailVerificado) {
    throw new RecusaBloqueadaError(
      'CONTA_EM_USO',
      'Esta conta já foi confirmada por quem a usa. Para removê-la, fale com o suporte.',
    )
  }

  if (await temAtividadeReal(usuario.id)) {
    throw new RecusaBloqueadaError(
      'ATIVIDADE_REAL',
      'Esta conta já tem comentários, decisões ou pagamentos registrados. Remover apagaria histórico de outras pessoas — fale com o suporte.',
    )
  }

  // Quem precisa saber que a pessoa recusou: o designer de cada projeto onde
  // ela foi posta como cliente.
  const projetos = await prisma.projeto.findMany({
    where: { clienteId: usuario.id },
    select: { id: true, nome: true, designerId: true },
  })

  /*
   * A remoção é a mesma do pedido de exclusão do titular (LGPD Art. 18 IV):
   * anonimiza em vez de apagar a linha, e libera o e-mail — assim a pessoa
   * pode se cadastrar de verdade depois, se quiser.
   *
   * Reaproveitar `deactivateUsuario` é de propósito: se um dia a política de
   * exclusão mudar, ela muda num lugar só. Convites pendentes são cancelados
   * aqui porque um convite para uma conta que não existe mais é um beco.
   */
  await prisma.conviteProjeto.updateMany({
    where: { convidadoId: usuario.id, status: 'PENDENTE' },
    data: { status: 'CANCELADO', respondidoEm: new Date() },
  })

  await new UsuarioService().deactivateUsuario(usuario.id)

  // Avisa cada designer. Falha de notificação não desfaz a remoção — o
  // direito da pessoa não depende de o e-mail do designer sair.
  for (const projeto of projetos) {
    notificacaoService.dispatch(
      projeto.designerId,
      'CLIENTE_RECUSOU_CADASTRO',
      'Seu cliente recusou o cadastro',
      `A pessoa que você cadastrou como cliente em "${projeto.nome}" pediu a remoção dos dados dela. O projeto continua aí, mas você precisa indicar outro cliente.`,
    )
  }

  return { projetosAfetados: projetos }
}
