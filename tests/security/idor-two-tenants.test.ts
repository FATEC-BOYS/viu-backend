/**
 * IDOR entre dois tenants — Designer A não alcança nada do Designer B.
 *
 * Todos os casos aqui exploram a mesma origem: `requireProjectAccess` resolvia
 * o projeto a autorizar a partir de `body.projetoId`, que quem chama controla,
 * em vez de partir do recurso que a rota endereça (`params.id`). Bastava mandar
 * no corpo o id de um projeto próprio para o middleware aprovar a operação
 * sobre uma arte/tarefa/feedback de outra pessoa — e os services dessas rotas
 * não tinham checagem própria para segurar.
 *
 * O contrato que estes testes fixam:
 *   1. quem manda é o recurso endereçado, nunca o corpo;
 *   2. o service é autoridade final — mesmo com o middleware desligado a
 *      operação cross-tenant morre (ver bloco "sem middleware").
 */
import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'

// ── Mocks (hoisted antes de qualquer import) ─────────────────────────────────

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  return { default: criarPrismaMock() }
})

vi.mock('../../src/services/notificacaoService.js', async () => {
  const { criarNotificacaoMock } = await import('../helpers/notificacaoMock.js')
  return criarNotificacaoMock()
})

// ── Imports (depois dos mocks) ───────────────────────────────────────────────

import prisma from '../../src/database/client.js'
import { buildServer } from '../../src/index.js'
import { makeToken, DESIGNER, DESIGNER_B, CLIENTE, CLIENTE_B, ORIGIN } from '../helpers/token.js'

const db = prisma as any

// ── Fixtures ─────────────────────────────────────────────────────────────────
// IDs com 25 caracteres: validateCuidParam rejeita qualquer coisa fora disso
// e devolveria 400 antes da autorização, mascarando o que se quer testar.

const SESSAO = { id: 'csessao000000000000000001' }

/** Projeto do atacante — é o id que ele injeta no corpo. */
const PROJETO_A = {
  id: 'cprojetoa0000000000000001',
  designerId: DESIGNER.id,
  clienteId: CLIENTE.id,
}

/** Projeto da vítima — nada aqui pertence ao Designer A. */
const PROJETO_B = {
  id: 'cprojetob0000000000000001',
  designerId: DESIGNER_B.id,
  clienteId: CLIENTE_B.id,
}

const ACESSO_B = { designerId: PROJETO_B.designerId, clienteId: PROJETO_B.clienteId }

const ARTE_B = {
  id: 'carteb0000000000000000001',
  nome: 'Arte da vítima',
  arquivo: 'artes/b/v1/arquivo.png',
  projetoId: PROJETO_B.id,
  autorId: DESIGNER_B.id,
  projeto: ACESSO_B,
}

const TAREFA_B = {
  id: 'ctarefab00000000000000001',
  titulo: 'Tarefa da vítima',
  status: 'PENDENTE',
  projetoId: PROJETO_B.id,
  projeto: ACESSO_B,
}

const FEEDBACK_B = {
  id: 'cfeedbackb000000000000001',
  arteId: ARTE_B.id,
  autorId: CLIENTE_B.id,
  resolvidoEm: null,
  arte: { projetoId: PROJETO_B.id, projeto: ACESSO_B },
}

/** Corpo que carrega o projeto do atacante — o vetor do ataque. */
const CORPO_ENVENENADO = { projetoId: PROJETO_A.id }

let app: FastifyInstance
let tokenA: string

async function inject(
  method: 'PUT' | 'DELETE' | 'POST',
  url: string,
  payload: Record<string, unknown>,
) {
  return app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${tokenA}`, ...ORIGIN },
    payload,
  })
}

beforeAll(async () => {
  app = await buildServer()
  await app.ready()
  tokenA = await makeToken(DESIGNER)
})

afterAll(async () => {
  await app.close()
})

beforeEach(() => {
  vi.clearAllMocks()
  // Sessão válida: o authenticate consulta o banco para permitir revogação.
  db.sessao.findFirst.mockResolvedValue(SESSAO)
  // Qualquer busca por projeto devolve o do ATACANTE. É o pior caso: se o
  // código olhar para o corpo em vez do recurso, ele encontra um projeto
  // legítimo do requisitante e libera.
  db.projeto.findUnique.mockResolvedValue(PROJETO_A)
  db.projeto.findFirst.mockResolvedValue(PROJETO_A)
  db.projeto.findMany.mockResolvedValue([{ id: PROJETO_A.id }])
  db.usuario.findUnique.mockResolvedValue({ id: DESIGNER.id, nome: DESIGNER.nome, tipo: 'DESIGNER' })
})

// ── Artes ────────────────────────────────────────────────────────────────────

describe('Artes — Designer A não altera arte do Designer B', () => {
  beforeEach(() => {
    db.arte.findUnique.mockResolvedValue(ARTE_B)
    db.arte.findFirst.mockResolvedValue(ARTE_B)
  })

  it('PUT /artes/:id com projetoId próprio no corpo é negado', async () => {
    const res = await inject('PUT', `/artes/${ARTE_B.id}`, {
      ...CORPO_ENVENENADO,
      nome: 'PWNED',
    })

    expect(res.statusCode).toBe(403)
    expect(db.arte.update).not.toHaveBeenCalled()
  })

  it('DELETE /artes/:id com projetoId próprio no corpo é negado', async () => {
    const res = await inject('DELETE', `/artes/${ARTE_B.id}`, CORPO_ENVENENADO)

    expect(res.statusCode).toBe(403)
    expect(db.arte.delete).not.toHaveBeenCalled()
  })
})

describe('Artes — o dono continua conseguindo (controle positivo)', () => {
  const ARTE_A = {
    id: 'cartea0000000000000000001',
    nome: 'Arte própria',
    arquivo: 'artes/a/v1/arquivo.png',
    projetoId: PROJETO_A.id,
    autorId: DESIGNER.id,
    projeto: { designerId: PROJETO_A.designerId, clienteId: PROJETO_A.clienteId },
  }

  it('PUT /artes/:id na própria arte segue funcionando', async () => {
    db.arte.findUnique.mockResolvedValue(ARTE_A)
    db.arte.update.mockResolvedValue({ ...ARTE_A, nome: 'Novo nome' })

    const res = await inject('PUT', `/artes/${ARTE_A.id}`, { nome: 'Novo nome' })

    expect(res.statusCode).toBe(200)
    expect(db.arte.update).toHaveBeenCalled()
  })
})

// ── Tarefas ──────────────────────────────────────────────────────────────────

describe('Tarefas — Designer A não altera tarefa do Designer B', () => {
  beforeEach(() => {
    // O middleware tenta arte primeiro; só depois cai em tarefa.
    db.arte.findUnique.mockResolvedValue(null)
    db.tarefa.findUnique.mockResolvedValue(TAREFA_B)
  })

  it('PUT /tarefas/:id com projetoId próprio no corpo é negado', async () => {
    const res = await inject('PUT', `/tarefas/${TAREFA_B.id}`, {
      ...CORPO_ENVENENADO,
      titulo: 'PWNED',
    })

    expect(res.statusCode).toBe(403)
    expect(db.tarefa.update).not.toHaveBeenCalled()
  })

  it('DELETE /tarefas/:id com projetoId próprio no corpo é negado', async () => {
    const res = await inject('DELETE', `/tarefas/${TAREFA_B.id}`, CORPO_ENVENENADO)

    expect(res.statusCode).toBe(403)
    expect(db.tarefa.delete).not.toHaveBeenCalled()
  })
})

// ── Feedbacks ────────────────────────────────────────────────────────────────

describe('Feedbacks — Designer A não mexe em thread do Designer B', () => {
  beforeEach(() => {
    db.arte.findUnique.mockResolvedValue(null)
    db.tarefa.findUnique.mockResolvedValue(null)
    db.feedback.findUnique.mockResolvedValue(FEEDBACK_B)
  })

  it('PUT /feedbacks/:id/resolver com projetoId próprio no corpo é negado', async () => {
    const res = await inject('PUT', `/feedbacks/${FEEDBACK_B.id}/resolver`, CORPO_ENVENENADO)

    expect(res.statusCode).toBe(403)
    expect(db.feedback.update).not.toHaveBeenCalled()
  })

  it('PUT /feedbacks/:id/reabrir com projetoId próprio no corpo é negado', async () => {
    const res = await inject('PUT', `/feedbacks/${FEEDBACK_B.id}/reabrir`, CORPO_ENVENENADO)

    expect(res.statusCode).toBe(403)
    expect(db.feedback.update).not.toHaveBeenCalled()
  })
})

describe('Feedbacks — criação em arte alheia', () => {
  it('POST /feedbacks com arteId alheio e projetoId próprio é negado', async () => {
    // arteId identifica o recurso; projetoId no mesmo corpo é o engodo.
    db.arte.findUnique.mockResolvedValue(ARTE_B)

    const res = await inject('POST', '/feedbacks', {
      ...CORPO_ENVENENADO,
      arteId: ARTE_B.id,
      conteudo: 'feedback injetado',
      tipo: 'TEXTO',
    })

    expect(res.statusCode).toBe(403)
    expect(db.feedback.create).not.toHaveBeenCalled()
  })
})

// ── Services como autoridade final ───────────────────────────────────────────
// Chamadas diretas, sem passar pelo middleware: se um dia a rota perder o
// preHandler (ou ganhar outro caminho de entrada), o service ainda barra.

describe('Services barram cross-tenant sem depender do middleware', () => {
  it('arteService.updateArte recusa arte de outro projeto', async () => {
    const { ArteService } = await import('../../src/services/arteService.js')
    db.arte.findUnique.mockResolvedValue(ARTE_B)

    await expect(
      new ArteService().updateArte(ARTE_B.id, { nome: 'PWNED' }, DESIGNER.id, false),
    ).rejects.toThrow(/Acesso negado/)
    expect(db.arte.update).not.toHaveBeenCalled()
  })

  it('arteService.deleteArte recusa arte de outro projeto', async () => {
    const { ArteService } = await import('../../src/services/arteService.js')
    db.arte.findUnique.mockResolvedValue(ARTE_B)

    await expect(
      new ArteService().deleteArte(ARTE_B.id, DESIGNER.id, false),
    ).rejects.toThrow(/Acesso negado/)
    expect(db.arte.delete).not.toHaveBeenCalled()
  })

  it('tarefaService.updateTarefa recusa tarefa de outro projeto', async () => {
    const { TarefaService } = await import('../../src/services/tarefaService.js')
    db.tarefa.findUnique.mockResolvedValue(TAREFA_B)

    await expect(
      new TarefaService().updateTarefa(TAREFA_B.id, { titulo: 'PWNED' }, DESIGNER.id, false),
    ).rejects.toThrow(/Acesso negado/)
    expect(db.tarefa.update).not.toHaveBeenCalled()
  })

  it('tarefaService.updateTarefa recusa mover tarefa para projeto de terceiro', async () => {
    const { TarefaService } = await import('../../src/services/tarefaService.js')
    // Tarefa é do atacante, mas o destino não é.
    db.tarefa.findUnique.mockResolvedValue({
      ...TAREFA_B,
      projetoId: PROJETO_A.id,
      projeto: { designerId: PROJETO_A.designerId, clienteId: PROJETO_A.clienteId },
    })
    db.projeto.findUnique.mockResolvedValue(PROJETO_B)

    await expect(
      new TarefaService().updateTarefa(
        TAREFA_B.id,
        { projetoId: PROJETO_B.id },
        DESIGNER.id,
        false,
      ),
    ).rejects.toThrow(/Acesso negado/)
    expect(db.tarefa.update).not.toHaveBeenCalled()
  })

  it('tarefaService.deleteTarefa recusa tarefa de outro projeto', async () => {
    const { TarefaService } = await import('../../src/services/tarefaService.js')
    db.tarefa.findUnique.mockResolvedValue(TAREFA_B)

    await expect(
      new TarefaService().deleteTarefa(TAREFA_B.id, DESIGNER.id, false),
    ).rejects.toThrow(/Acesso negado/)
    expect(db.tarefa.delete).not.toHaveBeenCalled()
  })

  it('feedbackService.createFeedback recusa arte de projeto alheio', async () => {
    const { FeedbackService } = await import('../../src/services/feedbackService.js')
    db.arte.findUnique.mockResolvedValue(ARTE_B)
    db.usuario.findUnique.mockResolvedValue({ id: DESIGNER.id, nome: DESIGNER.nome })

    await expect(
      new FeedbackService().createFeedback({
        conteudo: 'injetado',
        tipo: 'TEXTO',
        arteId: ARTE_B.id,
        autorId: DESIGNER.id,
      }),
    ).rejects.toThrow(/Acesso negado/)
    expect(db.feedback.create).not.toHaveBeenCalled()
  })

  it('feedbackService.resolverThread recusa thread de projeto alheio', async () => {
    const { FeedbackService } = await import('../../src/services/feedbackService.js')
    db.feedback.findUnique.mockResolvedValue(FEEDBACK_B)

    await expect(
      new FeedbackService().resolverThread(FEEDBACK_B.id, DESIGNER.id, false),
    ).rejects.toThrow(/Acesso negado/)
    expect(db.feedback.update).not.toHaveBeenCalled()
  })

  it('ADMIN continua passando pelo service', async () => {
    const { ArteService } = await import('../../src/services/arteService.js')
    db.arte.findUnique.mockResolvedValue(ARTE_B)
    db.arte.update.mockResolvedValue({ ...ARTE_B, nome: 'moderado' })

    await expect(
      new ArteService().updateArte(ARTE_B.id, { nome: 'moderado' }, 'admin-1', true),
    ).resolves.toBeTruthy()
    expect(db.arte.update).toHaveBeenCalled()
  })
})
