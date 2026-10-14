/**
 * Escrever no projeto é do designer. Ler é de quem é do projeto.
 *
 * São duas perguntas, e durante um bom tempo uma só respondia as duas:
 * `requireOwnership('projeto')` devolve "é do projeto?" — designer OU cliente
 * —, e estava em `GET`, `PUT` e `DELETE` igual. Medido em produção, logado
 * como cliente:
 *
 *   PUT    /projetos/:id  {"nome": …}        → 200, e o nome mudou no banco
 *   PUT    /projetos/:id  {"status":"CANCELADO"} → 200, e o produto trata
 *                                                 cancelado como definitivo
 *   DELETE /projetos/:id  (projeto vazio)    → 200, e a linha sumiu
 *   POST   /artes/upload                     → passou pela autorização
 *
 * Ou seja: o cliente editava, cancelava e APAGAVA o trabalho do designer.
 *
 * Nenhum teste pegava isso — as 928 asserções do repositório passavam com o
 * buraco aberto. Este arquivo existe para que a regra não dependa de ninguém
 * lembrar dela, e trava os dois lados: o cliente não escreve, E o cliente
 * continua lendo. Fechar demais seria trocar um defeito por outro.
 */
import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  const mock = criarPrismaMock()
  return { default: mock, prisma: mock }
})

vi.mock('../../src/utils/storage.js', () => ({
  uploadFile: vi.fn().mockResolvedValue(undefined),
  deleteFile: vi.fn().mockResolvedValue(undefined),
  signPath: vi.fn(async (p: string | null) => (p ? `https://r2.test/${p}?assinado` : null)),
  signPaths: vi.fn().mockResolvedValue([]),
  lerArquivo: vi.fn().mockResolvedValue(null),
  assinarAvatar: vi.fn().mockResolvedValue(null),
}))

import prisma from '../../src/database/client.js'
import { buildServer } from '../../src/index.js'
import { makeToken, DESIGNER, CLIENTE, ORIGIN } from '../helpers/token.js'

const db = prisma as any

const PROJETO_ID = 'c1a2b3c4d5e6f708192a3b4c5'
const PROJETO = {
  id: PROJETO_ID,
  nome: 'Identidade Visual',
  status: 'EM_ANDAMENTO',
  designerId: DESIGNER.id,
  clienteId: CLIENTE.id,
  // A leitura devolve o projeto com as relações; vazias bastam para o que
  // este arquivo mede, que é QUEM passa — não o que vem dentro.
  designer: { id: DESIGNER.id, nome: 'Ana', email: DESIGNER.email, telefone: null, avatar: null },
  cliente: { id: CLIENTE.id, nome: 'João', email: CLIENTE.email, telefone: null, avatar: null },
  artes: [],
  tarefas: [],
  equipe: null,
}

let app: FastifyInstance
let jwtCliente: string
let jwtDesigner: string

beforeAll(async () => {
  app = await buildServer()
  await app.ready()
  jwtCliente = await makeToken(CLIENTE)
  jwtDesigner = await makeToken(DESIGNER)
})

afterAll(async () => {
  await app.close()
})

beforeEach(() => {
  vi.clearAllMocks()
  db.sessao.findFirst.mockResolvedValue({ id: 'csessao000000000000000003' })
  db.projeto.findUnique.mockResolvedValue(PROJETO)
  db.projeto.findFirst.mockResolvedValue(PROJETO)
  db.projeto.update.mockResolvedValue(PROJETO)
  db.projeto.delete.mockResolvedValue(PROJETO)
  db.arte.count.mockResolvedValue(0)
  db.tarefa.count.mockResolvedValue(0)
})

describe('o cliente não escreve no projeto', () => {
  it('não renomeia — e nada é gravado', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/projetos/${PROJETO_ID}`,
      headers: { ...ORIGIN },
      cookies: { viu_token: jwtCliente },
      payload: { nome: 'RENOMEADO PELO CLIENTE' },
    })

    expect(res.statusCode).toBe(403)
    expect(db.projeto.update).not.toHaveBeenCalled()
  })

  /*
   * Cancelar é o pior dos casos: o próprio aviso da tela diz "Cancelado é
   * definitivo — não dá para retomar depois".
   */
  it('não cancela o projeto', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/projetos/${PROJETO_ID}`,
      headers: { ...ORIGIN },
      cookies: { viu_token: jwtCliente },
      payload: { status: 'CANCELADO' },
    })

    expect(res.statusCode).toBe(403)
    expect(db.projeto.update).not.toHaveBeenCalled()
  })

  it('não apaga o projeto', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/projetos/${PROJETO_ID}`,
      headers: { ...ORIGIN },
      cookies: { viu_token: jwtCliente },
    })

    expect(res.statusCode).toBe(403)
    expect(db.projeto.delete).not.toHaveBeenCalled()
  })

  /*
   * A recusa DIZ de quem é a ação. "Acesso negado" faria o cliente, que é do
   * projeto, achar que perdeu acesso a ele — e são conclusões opostas.
   */
  it('a recusa diz que a ação é de outra pessoa, não que ele perdeu acesso', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/projetos/${PROJETO_ID}`,
      headers: { ...ORIGIN },
      cookies: { viu_token: jwtCliente },
      payload: { nome: 'x' },
    })

    expect(res.json().message).toBe('Esta ação é do designer do projeto')
  })
})

describe('o designer escreve no próprio projeto', () => {
  it('renomeia', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/projetos/${PROJETO_ID}`,
      headers: { ...ORIGIN },
      cookies: { viu_token: jwtDesigner },
      payload: { nome: 'Identidade Visual v2' },
    })

    expect(res.statusCode).toBe(200)
    expect(db.projeto.update).toHaveBeenCalled()
  })
})

/*
 * O outro lado da regra, e tão importante quanto: o conserto não pode ter
 * trancado a leitura. O cliente é do projeto — ele vê tudo, comenta, aprova e
 * rejeita. O que ele não faz é escrever no projeto em si.
 */
describe('o cliente continua lendo o projeto', () => {
  it('abre o projeto normalmente', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/projetos/${PROJETO_ID}`,
      headers: { ...ORIGIN },
      cookies: { viu_token: jwtCliente },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().data.id).toBe(PROJETO_ID)
  })
})

/*
 * Quem não é do projeto continua levando "acesso negado" — a mensagem nova
 * vale só para quem É do projeto e não é o designer.
 */
describe('quem não é do projeto', () => {
  it('não escreve, e a recusa não entrega nada sobre o projeto', async () => {
    db.projeto.findUnique.mockResolvedValue({
      ...PROJETO,
      designerId: 'c9f8e7d6c5b4a30291807f6e5',
      clienteId: 'c5e4d3c2b1a09786756473829',
    })

    const res = await app.inject({
      method: 'PUT',
      url: `/projetos/${PROJETO_ID}`,
      headers: { ...ORIGIN },
      cookies: { viu_token: jwtCliente },
      payload: { nome: 'x' },
    })

    expect(res.statusCode).toBe(403)
    expect(res.json().message).toBe('Acesso negado: você não tem acesso a este projeto')
  })
})
