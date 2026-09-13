import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  const mock = criarPrismaMock()
  return { default: mock, prisma: mock }
})

import prisma from '../../src/database/client.js'
import { entrarComo, sairDaImpersonacao } from '../../src/services/impersonacaoService.js'

const db = prisma as any
const ADMIN = 'ca00000000000000000000001'
const ALVO = 'cc00000000000000000000001'

const admin = { id: ADMIN, email: 'admin@viu.com', nome: 'Carlos', tipo: 'ADMIN', ativo: true }
const cliente = { id: ALVO, email: 'joao@empresa.com', nome: 'João', tipo: 'CLIENTE', ativo: true }

beforeEach(() => {
  vi.clearAllMocks()
  db.sessao.create.mockResolvedValue({ id: 's1' })
  db.$transaction.mockImplementation(async (arg: any) =>
    typeof arg === 'function' ? arg(db) : Promise.all(arg),
  )
})

/** `findUnique` respondendo por id, que é como o serviço consulta. */
function usuarios(...lista: any[]) {
  db.usuario.findUnique.mockImplementation(async ({ where }: any) =>
    lista.find((u) => u.id === where.id) ?? null,
  )
}

describe('entrar na conta de outra pessoa', () => {
  it('a sessão criada aponta para o alvo e registra quem entrou', async () => {
    usuarios(admin, cliente)
    await entrarComo(ADMIN, ALVO)

    const dados = db.sessao.create.mock.calls[0][0].data
    expect(dados.usuarioId).toBe(ALVO)
    expect(dados.impersonadoPorId).toBe(ADMIN)
  })

  it('quem não é admin não entra', async () => {
    usuarios({ ...cliente, id: ADMIN, tipo: 'DESIGNER' }, cliente)
    await expect(entrarComo(ADMIN, ALVO)).rejects.toThrow('Acesso negado')
    expect(db.sessao.create).not.toHaveBeenCalled()
  })

  it('admin não entra na conta de outro admin', async () => {
    /*
     * Sem isto, quem tivesse o papel entraria na conta de outro admin e de lá
     * usaria as rotas administrativas como ele — escalada de privilégio com o
     * rastro apontando para a pessoa errada.
     */
    usuarios(admin, { ...cliente, tipo: 'ADMIN' })
    await expect(entrarComo(ADMIN, ALVO)).rejects.toThrow('outro administrador')
    expect(db.sessao.create).not.toHaveBeenCalled()
  })

  it('conta inativa não é acessível', async () => {
    usuarios(admin, { ...cliente, ativo: false })
    await expect(entrarComo(ADMIN, ALVO)).rejects.toThrow('inativa')
  })

  it('usuário inexistente dá erro em vez de sessão órfã', async () => {
    usuarios(admin)
    await expect(entrarComo(ADMIN, ALVO)).rejects.toThrow('não encontrado')
    expect(db.sessao.create).not.toHaveBeenCalled()
  })

  it('a sessão expira em minutos, não em dias', async () => {
    // Acesso ao dado de outra pessoa esquecido aberto é o modo mais comum de
    // isto virar problema.
    usuarios(admin, cliente)
    await entrarComo(ADMIN, ALVO)

    const { expiresAt } = db.sessao.create.mock.calls[0][0].data
    const minutos = (new Date(expiresAt).getTime() - Date.now()) / 60000
    expect(minutos).toBeGreaterThan(0)
    expect(minutos).toBeLessThanOrEqual(31)
  })

  it('o refresh nasce vencido — renovar prolongaria em silêncio', async () => {
    usuarios(admin, cliente)
    await entrarComo(ADMIN, ALVO)

    const { refreshExpiresAt } = db.sessao.create.mock.calls[0][0].data
    expect(new Date(refreshExpiresAt).getTime()).toBeLessThanOrEqual(Date.now())
  })
})

describe('sair e voltar para a própria conta', () => {
  it('revoga a impersonação e emite sessão do admin', async () => {
    db.sessao.findFirst.mockResolvedValue({ id: 's1', impersonadoPorId: ADMIN })
    usuarios(admin)

    const r = await sairDaImpersonacao('tok')

    expect(db.sessao.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 's1' }, data: { ativo: false } }),
    )
    expect(r.usuario.id).toBe(ADMIN)
    expect(db.sessao.create.mock.calls[0][0].data.usuarioId).toBe(ADMIN)
  })

  it('a nova sessão do admin NÃO é uma impersonação', async () => {
    // Senão o admin voltaria para a própria conta em modo leitura e não
    // conseguiria mais trabalhar.
    db.sessao.findFirst.mockResolvedValue({ id: 's1', impersonadoPorId: ADMIN })
    usuarios(admin)

    await sairDaImpersonacao('tok')

    expect(db.sessao.create.mock.calls[0][0].data.impersonadoPorId).toBeUndefined()
  })

  it('sessão comum não tem de onde sair', async () => {
    db.sessao.findFirst.mockResolvedValue({ id: 's1', impersonadoPorId: null })
    await expect(sairDaImpersonacao('tok')).rejects.toThrow('não é uma impersonação')
  })

  it('revogar e criar acontecem na mesma transação', async () => {
    // Separadas, uma falha deixaria o admin sem sessão nenhuma — deslogado no
    // meio do suporte.
    db.sessao.findFirst.mockResolvedValue({ id: 's1', impersonadoPorId: ADMIN })
    usuarios(admin)

    await sairDaImpersonacao('tok')

    expect(db.$transaction).toHaveBeenCalled()
  })
})
