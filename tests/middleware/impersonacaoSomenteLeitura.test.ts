import { describe, it, expect, vi, beforeEach } from 'vitest'
import { authenticate } from '../../src/middleware/authMiddleware.js'

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  return { default: criarPrismaMock() }
})

import prisma from '../../src/database/client.js'
import { makeToken, CLIENTE } from '../helpers/token.js'

/**
 * Impersonação é somente leitura, e a regra mora no middleware por onde toda
 * rota autenticada passa — não numa lista de rotas protegidas.
 *
 * A diferença é o que estes testes travam: com lista de proteção, a rota criada
 * mês que vem nasce escrevível e ninguém percebe. Negando por padrão, ela nasce
 * bloqueada.
 *
 * O que está em jogo é o valor probatório do produto: aceite com hash,
 * aprovação com data e feedback carimbado com a versão só provam alguma coisa
 * enquanto tiverem sido escritos pela pessoa a quem estão atribuídos. Um admin
 * capaz de clicar "Aprovar" dentro da conta do cliente derruba isso — e não só
 * para o clique dele: a defesa "o VIU entra na minha conta" passa a valer para
 * tudo que já está gravado.
 */

const ADMIN_ID = 'cadmin0000000000001'

function pedido(metodo: string, url: string, token: string) {
  return {
    method: metodo,
    url,
    headers: { authorization: `Bearer ${token}` },
    log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  } as any
}

function resposta() {
  const reply: any = {
    statusCode: 200,
    body: null,
    status(c: number) { reply.statusCode = c; return reply },
    send(d: any) { reply.body = d; return reply },
  }
  return reply
}

/** A sessão que o middleware vai encontrar. */
function sessao({ impersonada }: { impersonada: boolean }) {
  vi.mocked(prisma.sessao.findFirst).mockResolvedValue({
    id: 's1',
    impersonadoPorId: impersonada ? ADMIN_ID : null,
  } as any)
}

beforeEach(() => vi.clearAllMocks())

describe('o que uma sessão de impersonação pode fazer', () => {
  it('lê — é para isso que ela existe', async () => {
    sessao({ impersonada: true })
    const req = pedido('GET', '/projetos', await makeToken(CLIENTE))
    const reply = resposta()

    await authenticate(req, reply)

    expect(reply.statusCode).toBe(200)
    expect(req.usuario.id).toBe(CLIENTE.id)
  })

  it('não escreve, e a recusa diz o que houve', async () => {
    sessao({ impersonada: true })
    const req = pedido('POST', '/feedbacks', await makeToken(CLIENTE))
    const reply = resposta()

    await authenticate(req, reply)

    expect(reply.statusCode).toBe(403)
    expect(reply.body.message).toMatch(/somente leitura/i)
    expect(reply.body.impersonacao).toBe(true)
  })

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    'recusa %s em qualquer rota, sem lista de exceções por caminho',
    async (metodo) => {
      sessao({ impersonada: true })
      const req = pedido(metodo, '/uma/rota/que/nem/existe/ainda', await makeToken(CLIENTE))
      const reply = resposta()

      await authenticate(req, reply)

      expect(reply.statusCode).toBe(403)
    },
  )

  it('a aprovação — o ato que o produto existe para registrar — é recusada', async () => {
    sessao({ impersonada: true })
    const req = pedido('PATCH', '/aprovacoes/c123', await makeToken(CLIENTE))
    const reply = resposta()

    await authenticate(req, reply)

    expect(reply.statusCode).toBe(403)
  })

  it('o aceite dos termos é recusado', async () => {
    sessao({ impersonada: true })
    const req = pedido('POST', '/termos/aceite', await makeToken(CLIENTE))
    const reply = resposta()

    await authenticate(req, reply)

    expect(reply.statusCode).toBe(403)
  })

  it('mas consegue SAIR — senão o admin fica trancado dentro da conta', async () => {
    sessao({ impersonada: true })
    const req = pedido('POST', '/admin/impersonar/sair', await makeToken(CLIENTE))
    const reply = resposta()

    await authenticate(req, reply)

    expect(reply.statusCode).toBe(200)
  })

  it('e consegue deslogar', async () => {
    sessao({ impersonada: true })
    const req = pedido('POST', '/auth/logout', await makeToken(CLIENTE))
    const reply = resposta()

    await authenticate(req, reply)

    expect(reply.statusCode).toBe(200)
  })

  it('a query string não driblará a saída nem a proibição', async () => {
    // `request.url` traz `?`; comparar cru faria "/feedbacks?x=1" escapar da
    // lista de saídas — e, pior, faria a saída legítima com query falhar.
    sessao({ impersonada: true })
    const req = pedido('POST', '/admin/impersonar/sair?de=tela', await makeToken(CLIENTE))
    const reply = resposta()

    await authenticate(req, reply)

    expect(reply.statusCode).toBe(200)
  })

  it('expõe quem está dentro, para a tela poder avisar', async () => {
    sessao({ impersonada: true })
    const req = pedido('GET', '/auth/me', await makeToken(CLIENTE))

    await authenticate(req, resposta())

    expect(req.usuario.impersonadoPor).toBe(ADMIN_ID)
  })
})

describe('sessão comum segue escrevendo', () => {
  it('POST passa quando não há impersonação', async () => {
    sessao({ impersonada: false })
    const req = pedido('POST', '/feedbacks', await makeToken(CLIENTE))
    const reply = resposta()

    await authenticate(req, reply)

    expect(reply.statusCode).toBe(200)
    expect(req.usuario.impersonadoPor).toBeNull()
  })
})
