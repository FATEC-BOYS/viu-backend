import { describe, it, expect, vi, beforeEach } from 'vitest'
import { UsuarioService } from '../../src/services/usuarioService.js'

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  const mock = criarPrismaMock()
  return { default: mock, prisma: mock }
})

import prisma from '../../src/database/client.js'

/**
 * O designer não cria uma conta — ele aponta uma pessoa.
 *
 * O wizard chamava "criar usuário" e batia em "Email já está em uso" sempre
 * que a pessoa já tinha conta. Sem saída: a busca do produto não varre
 * pessoas e `GET /usuarios` é ADMIN-only. O designer inventava um segundo
 * e-mail, e a mesma pessoa ficava com duas contas.
 */

const service = new UsuarioService()
const db = prisma as any

beforeEach(() => vi.clearAllMocks())

const DADOS = { email: 'maria@agencia.com', nome: 'Maria Souza', telefone: '11999999999' }

describe('resolverCliente', () => {
  it('devolve a conta que já existe, sem criar outra', async () => {
    db.usuario.findUnique.mockResolvedValue({
      id: 'u1', nome: 'Maria S.', email: DADOS.email, ativo: true, excluidoEm: null,
    })

    const r = await service.resolverCliente(DADOS)

    expect(r.jaExistia).toBe(true)
    expect(r.usuario.id).toBe('u1')
    expect(db.usuario.create).not.toHaveBeenCalled()
  })

  it('não renomeia a conta alheia com o que veio do formulário', async () => {
    db.usuario.findUnique.mockResolvedValue({
      id: 'u1', nome: 'Maria S.', email: DADOS.email, ativo: true, excluidoEm: null,
    })

    const r = await service.resolverCliente({ ...DADOS, nome: 'APELIDO DO DESIGNER' })

    expect(r.usuario.nome).toBe('Maria S.')
    expect(db.usuario.update).not.toHaveBeenCalled()
  })

  it('cria quando ninguém tem aquele e-mail', async () => {
    db.usuario.findUnique.mockResolvedValue(null)
    db.usuario.create.mockResolvedValue({ id: 'novo', nome: DADOS.nome, email: DADOS.email })

    const r = await service.resolverCliente(DADOS)

    expect(r.jaExistia).toBe(false)
    expect(r.usuario.id).toBe('novo')
    const [argumentos] = db.usuario.create.mock.calls[0] as [any]
    expect(argumentos.data.tipo).toBe('CLIENTE')
    // A senha é gerada no servidor e nunca é o que veio do corpo.
    expect(argumentos.data.senha).toEqual(expect.any(String))
    expect(argumentos.data.senha).not.toBe('')
  })

  it('conta desativada não é apontável', async () => {
    db.usuario.findUnique.mockResolvedValue({
      id: 'u1', nome: 'X', email: DADOS.email, ativo: false, excluidoEm: null,
    })

    await expect(service.resolverCliente(DADOS)).rejects.toMatchObject({
      codigo: 'CONTA_INDISPONIVEL',
    })
    expect(db.usuario.create).not.toHaveBeenCalled()
  })

  it('conta excluída também não', async () => {
    db.usuario.findUnique.mockResolvedValue({
      id: 'u1', nome: 'Usuário Removido', email: DADOS.email, ativo: true, excluidoEm: new Date(),
    })

    await expect(service.resolverCliente(DADOS)).rejects.toMatchObject({
      codigo: 'CONTA_INDISPONIVEL',
    })
  })

  /*
   * Resolver NÃO coloca ninguém em projeto nenhum. Quem faz isso é
   * `POST /projetos`, que nasce RASCUNHO e dispara convite — a outra parte
   * aceita antes de o projeto andar.
   */
  /*
   * O aviso a quem não pediu a conta é responsabilidade do handler, não deste
   * serviço — mas o teste dele vive junto porque a regra é uma só: conta nova
   * criada por terceiro nunca nasce em silêncio. Ver
   * `sendAvisoDeContaCriadaPorTerceiro` e `resolverClienteHandler`.
   */
  it('a conta criada aqui não tem senha escolhida por terceiro', async () => {
    db.usuario.findUnique.mockResolvedValue(null)
    db.usuario.create.mockResolvedValue({ id: 'novo', nome: DADOS.nome, email: DADOS.email })

    await service.resolverCliente({ ...DADOS, ...({ senha: 'a-que-o-designer-quis' } as any) })

    const [argumentos] = db.usuario.create.mock.calls[0] as [any]
    expect(argumentos.data.senha).not.toContain('a-que-o-designer-quis')
  })

  it('não toca em projeto nem em vínculo', async () => {
    db.usuario.findUnique.mockResolvedValue({
      id: 'u1', nome: 'Maria S.', email: DADOS.email, ativo: true, excluidoEm: null,
    })

    await service.resolverCliente(DADOS)

    expect(db.projeto.create).not.toHaveBeenCalled()
    expect(db.vinculoCliente.upsert).not.toHaveBeenCalled()
  })
})
