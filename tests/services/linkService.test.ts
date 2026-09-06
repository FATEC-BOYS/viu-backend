import { describe, it, expect, vi, beforeEach } from 'vitest'

// linkService importa o named export, não o default — o mock precisa dos dois
// apontando para o MESMO objeto, senão o teste espia um proxy e o service usa
// outro.
vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  const mock = criarPrismaMock()
  return { default: mock, prisma: mock }
})

import { prisma } from '../../src/database/client.js'
import { LinkService } from '../../src/services/linkService.js'

const service = new LinkService()
const db = prisma as any

beforeEach(() => {
  vi.clearAllMocks()
  db.linkCompartilhado.findMany.mockResolvedValue([])
})

/** O que a listagem de links entrega sobre o cliente do projeto. */
describe('listLinks', () => {
  async function selectDoCliente(isAdmin = false) {
    await service.listLinks('cdesigner00000000000000001', isAdmin)
    const [args] = db.linkCompartilhado.findMany.mock.calls[0]
    return args.include.arte.select.projeto.select.cliente.select
  }

  /**
   * O designer precisa do telefone para mandar o link de revisão pelo
   * WhatsApp. Sem isto ele redigita o número a cada envio, mesmo com o
   * cadastro preenchido pelo próprio ClienteWizard.
   */
  it('devolve o telefone do cliente junto com o nome', async () => {
    const select = await selectDoCliente()
    expect(select).toMatchObject({ nome: true, telefone: true })
  })

  /**
   * Listagem não é lugar de despejar o cadastro inteiro: o designer precisa de
   * nome e telefone para falar com a pessoa, e de mais nada.
   */
  it('não vaza o resto do cadastro do cliente', async () => {
    const select = await selectDoCliente()
    for (const campo of ['senha', 'email', 'twoFactorSecret', 'emailVerificacaoToken']) {
      expect(select[campo]).toBeUndefined()
    }
  })

  it('não-admin só enxerga links de projeto em que participa', async () => {
    await service.listLinks('cdesigner00000000000000001', false)
    const [args] = db.linkCompartilhado.findMany.mock.calls[0]
    expect(args.where.arte.projeto.OR).toEqual([
      { designerId: 'cdesigner00000000000000001' },
      { clienteId: 'cdesigner00000000000000001' },
    ])
  })

  it('admin não recebe filtro de escopo', async () => {
    await service.listLinks('cadmin000000000000000001', true)
    const [args] = db.linkCompartilhado.findMany.mock.calls[0]
    expect(args.where).toEqual({})
  })
})
