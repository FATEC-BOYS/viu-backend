import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  return { default: criarPrismaMock() }
})

import prisma from '../../src/database/client.js'
import { PlanoService } from '../../src/services/planoService.js'

const service = new PlanoService()

function gratuito(extra: Record<string, unknown> = {}) {
  return {
    id: 'p0',
    nome: 'Gratuito',
    tipo: 'DESIGNER',
    ativo: true,
    precoMensal: 0,
    precoAnual: null,
    taxaPlataforma: 0.1,
    limitesProjetos: 3,
    limitesArtes: 20,
    ...extra,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.plano.update).mockImplementation(async ({ data }: any) => gratuito(data) as never)
  // Sem outro gratuito ativo, salvo quando o teste disser o contrário.
  vi.mocked(prisma.plano.findFirst).mockResolvedValue(null as never)
})

/*
 * Desde que o teto de recursos e a taxa da fatura saem de `assinaturaVigente`,
 * quem não assina nada É assinante do Gratuito. Conferido no app: com o
 * Gratuito desativado, `/assinaturas/minha` respondeu "plano em vigor: NENHUM"
 * e `POST /projetos` passou com 3 projetos num teto de 3 — o limite deixou de
 * existir, sem nada na tela avisando.
 */
describe('O plano gratuito é o piso e não se remove por edição', () => {
  it('recusa desativar o último gratuito de designer', async () => {
    vi.mocked(prisma.plano.findUnique).mockResolvedValue(gratuito() as never)

    await expect(service.updatePlano('p0', { ativo: false })).rejects.toThrow(
      /único plano gratuito/,
    )
    expect(prisma.plano.update).not.toHaveBeenCalled()
  })

  it('recusa passar a cobrar pelo último gratuito', async () => {
    vi.mocked(prisma.plano.findUnique).mockResolvedValue(gratuito() as never)

    await expect(service.updatePlano('p0', { precoMensal: 1900 })).rejects.toThrow(
      /único plano gratuito/,
    )
  })

  it('recusa mudar o tipo do último gratuito de designer', async () => {
    vi.mocked(prisma.plano.findUnique).mockResolvedValue(gratuito() as never)

    await expect(service.updatePlano('p0', { tipo: 'CLIENTE' })).rejects.toThrow(
      /único plano gratuito/,
    )
  })

  /* Havendo outro gratuito ativo o piso continua de pé, e a edição é
     legítima — desativar um plano substituído é uso normal. */
  it('deixa desativar quando existe outro gratuito ativo', async () => {
    vi.mocked(prisma.plano.findUnique).mockResolvedValue(gratuito() as never)
    vi.mocked(prisma.plano.findFirst).mockResolvedValue({ id: 'p9' } as never)

    await service.updatePlano('p0', { ativo: false })

    expect(prisma.plano.update).toHaveBeenCalled()
  })

  /* Mexer nos limites do piso é decisão de produto, não remoção do piso: a
     guarda não pode virar uma tela de administração que não administra. */
  it('deixa mudar os limites e a taxa do gratuito', async () => {
    vi.mocked(prisma.plano.findUnique).mockResolvedValue(gratuito() as never)

    await service.updatePlano('p0', { limitesProjetos: 10, taxaPlataforma: 0.08 })

    expect(prisma.plano.update).toHaveBeenCalled()
  })

  it('não atrapalha a edição de um plano pago', async () => {
    vi.mocked(prisma.plano.findUnique).mockResolvedValue(
      gratuito({ id: 'p1', nome: 'Profissional', precoMensal: 4900 }) as never,
    )

    await service.updatePlano('p1', { ativo: false })

    expect(prisma.plano.update).toHaveBeenCalled()
  })
})
