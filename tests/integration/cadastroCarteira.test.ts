import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  return { default: criarPrismaMock() }
})
vi.mock('../../src/services/emailVerificationService.js', () => ({ sendVerificationEmail: vi.fn(), sendAvisoDeContaCriadaPorTerceiro: vi.fn().mockResolvedValue(undefined) }))
import prisma from '../../src/database/client.js'
import { resolverClienteHandler } from '../../src/controllers/usuarioController.js'
const db = prisma as any
beforeEach(() => { vi.clearAllMocks(); db.usuario.findUnique.mockResolvedValue({ id: 'cliente1', nome: 'Ana', email: 'ana@exemplo.com', ativo: true, excluidoEm: null }) })
it('vincula o cliente ao solicitante mesmo sem criar projeto', async () => {
  const req = { usuario: { id: 'designer1' }, body: { nome: 'Ana', email: 'ana@exemplo.com' }, log: { error: vi.fn() } }
  const reply: any = { status: vi.fn().mockReturnThis(), send: vi.fn() }
  await resolverClienteHandler(req as any, reply)
  expect(db.vinculoCliente.upsert).toHaveBeenCalledWith({
    where: { designerId_clienteId: { designerId: 'designer1', clienteId: 'cliente1' } },
    create: { designerId: 'designer1', clienteId: 'cliente1' }, update: {},
  })
  expect(db.projeto.create).not.toHaveBeenCalled()
  expect(reply.status).toHaveBeenCalledWith(200)
})
