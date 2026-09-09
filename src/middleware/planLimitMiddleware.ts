import { FastifyRequest, FastifyReply } from 'fastify'
import prisma from '../database/client.js'
import { env } from '../config/env.js'

type LimitResource = 'projetos' | 'artes'

/**
 * Teto de recursos por usuário.
 *
 * Antes este middleware saía calado para quem não tinha assinatura ativa —
 * "free tier, sem limite". Como usuário novo nunca tem assinatura, o plano
 * gratuito era, na prática, ilimitado: exatamente o contrário do que a
 * palavra "free" faz o time acreditar ao ler o código. Agora quem não assina
 * cai no teto de beta (`BETA_MAX_*`), ajustável por variável de ambiente sem
 * deploy.
 *
 * Quem assina continua com o limite do plano, e `null` no plano segue
 * significando ilimitado — plano pago sem teto é decisão de produto, não
 * descuido.
 */
export function requirePlanLimit(resource: LimitResource) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const usuario = (request as any).usuario
      if (!usuario?.id) return

      const assinatura = await prisma.assinatura.findFirst({
        where: { usuarioId: usuario.id, status: 'ATIVA' },
        include: { plano: { select: { nome: true, limitesProjetos: true, limitesArtes: true } } },
      })

      const plano = assinatura?.plano
      const tetoBeta = resource === 'projetos' ? env.BETA_MAX_PROJETOS : env.BETA_MAX_ARTES

      const limite: number | null = plano
        ? resource === 'projetos'
          ? plano.limitesProjetos
          : plano.limitesArtes
        : tetoBeta

      if (limite === null) return

      const uso =
        resource === 'projetos'
          ? await prisma.projeto.count({
              where: { designerId: usuario.id, status: { notIn: ['CANCELADO'] } },
            })
          : await prisma.arte.count({
              where: { autorId: usuario.id, projeto: { designerId: usuario.id } },
            })

      if (uso >= limite) {
        reply.status(402).send({
          message: plano
            ? `Limite do plano "${plano.nome}" atingido: ${limite} ${resource}. Faça upgrade para continuar.`
            : `Você chegou ao limite do beta: ${limite} ${resource}. Fale com a gente para liberar mais.`,
          success: false,
          limitReached: true,
          resource,
          limite,
          uso,
        })
      }
    } catch {
      // Never block the request on middleware errors
    }
  }
}
