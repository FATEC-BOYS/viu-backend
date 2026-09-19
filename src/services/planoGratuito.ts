import prisma from '../database/client.js'

/**
 * Qual linha da tabela `planos` é "o plano gratuito do designer".
 *
 * Existe como função única porque a resposta é lida em dois lugares que
 * precisam concordar: a taxa que a fatura retém e a assinatura que o cadastro
 * cria. Se cada um escolhesse o gratuito por conta própria, bastaria haver
 * dois planos de preço zero para o designer ser cobrado pela taxa de um e
 * limitado pelos tetos de outro — o tipo de divergência que só aparece na
 * fatura de alguém.
 *
 * `orderBy` explícito pelo mesmo motivo: sem ordem declarada o Postgres pode
 * devolver outra linha a cada consulta, e a taxa mudaria sozinha entre duas
 * faturas do mesmo designer. O mais antigo é o que já estava valendo.
 */
export function planoGratuitoDoDesigner() {
  return prisma.plano.findFirst({
    where: { tipo: 'DESIGNER', ativo: true, precoMensal: 0 },
    orderBy: { criadoEm: 'asc' },
  })
}
