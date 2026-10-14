/**
 * "Não pode" responde 409, com a frase inteira. Não 500.
 *
 * Medido no app, logada como designer, arrastando o projeto concluído de volta
 * para "Em andamento" no Board:
 *
 *   PUT /projetos/:id {"status":"EM_ANDAMENTO"} → 500
 *
 * O servidor tinha escrito a frase certa — "Projeto em status CONCLUIDO é
 * terminal e não pode ser alterado" —, mas `assertValidTransition` lançava
 * `Error` puro, o `catch` do controller mandava para `erroInterno` e saía 500.
 * Em produção é pior: o handler troca a mensagem de todo 5xx por "Erro interno
 * do servidor", com razão, porque 5xx é falha nossa. A frase boa nunca
 * chegava, e a tela mostrava "Não consegui mover, desfazendo…".
 *
 * 409 Conflict é o que de fato aconteceu: o pedido faz sentido, mas conflita
 * com o estado do recurso. E aí a mensagem pode viajar — é vocabulário do
 * produto, não entranha de servidor.
 *
 * Contra o código antigo, estes testes falham na asserção do status: 500 onde
 * se espera 409.
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

function projeto(status: string) {
  return {
    id: PROJETO_ID,
    nome: 'Identidade Visual',
    status,
    designerId: DESIGNER.id,
    clienteId: CLIENTE.id,
    designer: { id: DESIGNER.id, nome: 'Ana', email: DESIGNER.email, telefone: null, avatar: null },
    cliente: { id: CLIENTE.id, nome: 'João', email: CLIENTE.email, telefone: null, avatar: null },
    artes: [],
    tarefas: [],
    equipe: null,
  }
}

let app: FastifyInstance
let jwtDesigner: string

beforeAll(async () => {
  app = await buildServer()
  await app.ready()
  jwtDesigner = await makeToken(DESIGNER)
})

afterAll(async () => {
  await app.close()
})

beforeEach(() => {
  vi.clearAllMocks()
  db.sessao.findFirst.mockResolvedValue({ id: 'csessao000000000000000003' })
})

function mudarStatus(de: string, para: string) {
  db.projeto.findUnique.mockResolvedValue(projeto(de))
  db.projeto.findFirst.mockResolvedValue(projeto(de))
  db.projeto.update.mockResolvedValue(projeto(para))
  return app.inject({
    method: 'PUT',
    url: `/projetos/${PROJETO_ID}`,
    headers: { ...ORIGIN },
    cookies: { viu_token: jwtDesigner },
    payload: { status: para },
  })
}

describe('transição que o produto não permite', () => {
  it('sair de CONCLUIDO responde 409, não 500', async () => {
    const res = await mudarStatus('CONCLUIDO', 'EM_ANDAMENTO')

    expect(res.statusCode).toBe(409)
    expect(db.projeto.update).not.toHaveBeenCalled()
  })

  /*
   * O motivo da mudança: é esta frase que a tela mostra. Antes ela morria no
   * caminho e sobrava "Não consegui mover".
   */
  it('e a resposta carrega a frase que explica', async () => {
    const res = await mudarStatus('CONCLUIDO', 'EM_ANDAMENTO')

    expect(res.json().message).toBe(
      'Projeto em status "CONCLUIDO" é terminal e não pode ser alterado',
    )
  })

  it('pausar um projeto que ainda espera o aceite é 409, com os destinos possíveis', async () => {
    const res = await mudarStatus('RASCUNHO', 'PAUSADO')

    expect(res.statusCode).toBe(409)
    expect(res.json().message).toContain('Permitido: EM_ANDAMENTO, CANCELADO')
  })

  /*
   * RASCUNHO como DESTINO nem chega à máquina de estados: `UpdateProjetoRequestSchema`
   * não o aceita, e a recusa sai como 400 na validação do corpo. Está certo —
   * ninguém volta para a espera do aceite —, e fica registrado aqui porque é a
   * primeira coisa que confunde quem for medir: o 409 vem do estado atual, o
   * 400 vem do valor pedido.
   */
  it('RASCUNHO como destino é recusado antes, na validação do corpo', async () => {
    const res = await mudarStatus('EM_ANDAMENTO', 'RASCUNHO')

    expect(res.statusCode).toBe(400)
    expect(db.projeto.update).not.toHaveBeenCalled()
  })
})

/*
 * O outro lado: a mudança não pode ter transformado falha de servidor em 409,
 * nem ter trancado o que é permitido.
 */
describe('o que é permitido continua passando', () => {
  it('EM_ANDAMENTO → PAUSADO grava e responde 200', async () => {
    const res = await mudarStatus('EM_ANDAMENTO', 'PAUSADO')

    expect(res.statusCode).toBe(200)
    expect(db.projeto.update).toHaveBeenCalled()
  })
})

describe('falha de verdade continua 500', () => {
  it('o banco caindo no update não vira recusa de regra', async () => {
    db.projeto.findUnique.mockResolvedValue(projeto('EM_ANDAMENTO'))
    db.projeto.findFirst.mockResolvedValue(projeto('EM_ANDAMENTO'))
    db.projeto.update.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:5432'))

    const res = await app.inject({
      method: 'PUT',
      url: `/projetos/${PROJETO_ID}`,
      headers: { ...ORIGIN },
      cookies: { viu_token: jwtDesigner },
      payload: { status: 'PAUSADO' },
    })

    expect(res.statusCode).toBe(500)
    // E a mensagem do banco não vaza para quem chamou.
    expect(res.json().message).not.toContain('ECONNREFUSED')
  })
})
