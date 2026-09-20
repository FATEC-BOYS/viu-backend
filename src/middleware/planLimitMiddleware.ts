import { FastifyRequest, FastifyReply } from 'fastify'
import prisma from '../database/client.js'
import { planoVigente } from '../services/assinaturaVigente.js'

type LimitResource = 'projetos' | 'artes'

/**
 * Teto de recursos por usuário.
 *
 * Antes este middleware saía calado para quem não tinha assinatura ativa —
 * "free tier, sem limite". Como usuário novo nunca tem assinatura, o plano
 * gratuito era, na prática, ilimitado: exatamente o contrário do que a
 * palavra "free" faz o time acreditar ao ler o código. Depois disso passou a
 * cair nas variáveis `BETA_MAX_*` — o que consertava o buraco e abria outro:
 * a taxa da fatura caía no plano Gratuito e o teto caía no ambiente, duas
 * fontes para a mesma pergunta. Os números batiam por coincidência (3 e 20
 * dos dois lados) e bastava mexer num deles para o designer ser cobrado pela
 * taxa de um plano e limitado pelos tetos de outro.
 *
 * Agora o plano em vigor sai de `assinaturaVigente`, que é a mesma leitura
 * que a fatura e a tela de assinatura usam. Quem não assina está no Gratuito,
 * e os limites são os que a tela de administração de planos mostra — o que
 * também faz aquela tela valer para valer.
 *
 * `null` no plano segue significando ilimitado: plano pago sem teto é decisão
 * de produto, não descuido.
 */
export function requirePlanLimit(resource: LimitResource) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const usuario = (request as any).usuario
      if (!usuario?.id) return

      const plano = await planoVigente(usuario.id)
      // Sem plano Gratuito cadastrado não há teto declarado em lugar nenhum.
      // Bloquear por um número inventado aqui seria pior do que deixar passar.
      if (!plano) return

      const limite: number | null =
        resource === 'projetos' ? plano.limitesProjetos : plano.limitesArtes

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
