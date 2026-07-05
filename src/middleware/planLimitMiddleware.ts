import { FastifyRequest, FastifyReply } from 'fastify'
import prisma from '../database/client.js'

type LimitResource = 'projetos' | 'artes'

// Factory that returns a preHandler enforcing plan-level resource limits.
// Returns 402 if the user has an active paid subscription whose plan cap is exceeded.
// Skips silently when: no subscription, free plan, or limit is null (unlimited).
export function requirePlanLimit(resource: LimitResource) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const usuario = (request as any).usuario
      if (!usuario?.id) return

      const assinatura = await prisma.assinatura.findFirst({
        where: { usuarioId: usuario.id, status: 'ATIVA' },
        include: { plano: { select: { nome: true, limitesProjetos: true, limitesArtes: true, precoMensal: true } } },
      })

      // No active subscription or free plan → no limits enforced
      if (!assinatura || assinatura.plano.precoMensal === 0) return

      const plano = assinatura.plano
      let limite: number | null = null
      let uso = 0

      if (resource === 'projetos') {
        limite = plano.limitesProjetos
        if (limite !== null) {
          uso = await prisma.projeto.count({
            where: { designerId: usuario.id, status: { notIn: ['CANCELADO'] } },
          })
        }
      } else {
        limite = plano.limitesArtes
        if (limite !== null) {
          uso = await prisma.arte.count({
            where: { autorId: usuario.id, projeto: { designerId: usuario.id } },
          })
        }
      }

      if (limite !== null && uso >= limite) {
        reply.status(402).send({
          message: `Limite do plano "${plano.nome}" atingido: ${limite} ${resource}. Faça upgrade para continuar.`,
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
