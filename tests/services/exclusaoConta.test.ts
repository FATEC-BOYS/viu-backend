import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  return { default: criarPrismaMock() }
})

import prisma from '../../src/database/client.js'
import { UsuarioService } from '../../src/services/usuarioService.js'

const db = prisma as any
const service = new UsuarioService()
const ID = 'cu00000000000000000000001'

beforeEach(() => {
  vi.clearAllMocks()
  db.usuario.findUnique.mockResolvedValue({ id: ID, email: 'joao@empresa.com', nome: 'João' })
  db.$transaction.mockResolvedValue([{}, {}])
})

/**
 * O `data` do update do usuário.
 *
 * Lido de `usuario.update`, e não do array que chega em `$transaction`: o
 * Prisma recebe ali as chamadas JÁ INVOCADAS, então o array carrega os
 * retornos, não os argumentos.
 */
function dadosDaAnonimizacao() {
  return db.usuario.update.mock.calls[0][0]
}

/**
 * A anonimização já funcionava: nome, e-mail, telefone, avatar, senha e
 * segredos de 2FA viram dado neutro e as sessões caem. O que faltava era dizer
 * QUANDO — sobrava `ativo: false`, que não distingue conta excluída de conta
 * desativada e não carrega data nenhuma.
 */
describe('excluir a conta', () => {
  it('grava a data do pedido', async () => {
    const antes = Date.now()
    await service.deactivateUsuario(ID)

    const { excluidoEm } = dadosDaAnonimizacao().data
    expect(excluidoEm).toBeInstanceOf(Date)
    expect(excluidoEm.getTime()).toBeGreaterThanOrEqual(antes)
  })

  it('continua anonimizando o que é pessoal', async () => {
    await service.deactivateUsuario(ID)
    const d = dadosDaAnonimizacao().data

    expect(d.nome).toBe('Usuário Removido')
    expect(d.email).toContain('@removed.viu.app')
    expect(d.telefone).toBeNull()
    expect(d.avatar).toBeNull()
    expect(d.senha).toBeNull()
  })

  it('derruba os segredos de acesso junto', async () => {
    // Conta excluída que mantém segredo de 2FA ou token de reset é conta que
    // ainda pode ser usada para entrar.
    await service.deactivateUsuario(ID)
    const d = dadosDaAnonimizacao().data

    expect(d.twoFactorEnabled).toBe(false)
    expect(d.twoFactorSecret).toBeNull()
    expect(d.twoFactorBackupCodes).toEqual([])
    expect(d.passwordResetToken).toBeNull()
    expect(d.emailVerificacaoToken).toBeNull()
  })

  it('invalida as sessões abertas na mesma transação', async () => {
    /*
     * Separadas, uma falha deixaria a conta anonimizada e a sessão viva — ou o
     * contrário. E a sessão viva de uma conta anonimizada é a pior das duas:
     * acesso sem dono identificável.
     */
    await service.deactivateUsuario(ID)

    expect(db.$transaction).toHaveBeenCalledTimes(1)
    expect(db.$transaction.mock.calls[0][0]).toHaveLength(2)
    expect(db.sessao.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { usuarioId: ID, ativo: true },
        data: { ativo: false },
      }),
    )
  })

  it('não apaga o que a obrigação fiscal manda guardar', async () => {
    // O tipo da conta e a data de entrada sobrevivem: não são PII e são o que
    // liga faturas e projetos que precisam ficar cinco anos.
    await service.deactivateUsuario(ID)
    const d = dadosDaAnonimizacao().data

    expect(d).not.toHaveProperty('tipo')
    expect(d).not.toHaveProperty('criadoEm')
  })

  it('conta inexistente não vira exclusão silenciosa', async () => {
    db.usuario.findUnique.mockResolvedValue(null)
    await expect(service.deactivateUsuario(ID)).rejects.toThrow('não encontrado')
    expect(db.$transaction).not.toHaveBeenCalled()
  })
})

describe('o que o painel do admin recebe', () => {
  it('a listagem traz a data de exclusão', async () => {
    // Sem isto o painel só conseguiria dizer "Inativo", que é a informação que
    // não serve para nada depois de o titular pedir a exclusão.
    db.usuario.findMany.mockResolvedValue([])
    db.usuario.count.mockResolvedValue(0)

    await service.listUsuarios({})

    const select = db.usuario.findMany.mock.calls[0][0].select
    expect(select.excluidoEm).toBe(true)
  })

  it('a listagem não devolve senha nem segredo de 2FA', async () => {
    db.usuario.findMany.mockResolvedValue([])
    db.usuario.count.mockResolvedValue(0)

    await service.listUsuarios({})

    const select = db.usuario.findMany.mock.calls[0][0].select
    expect(select.senha).toBeUndefined()
    expect(select.twoFactorSecret).toBeUndefined()
  })
})
