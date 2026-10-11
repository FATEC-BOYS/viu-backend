/**
 * O token autoriza a CONVERSA daquela arte — não só a primeira mensagem.
 *
 * O produto existe para encurtar a volta entre "não gostei" e a próxima
 * versão, e quem fecha essa volta é a resposta. Comentar pelo link sempre
 * funcionou; responder não existia, porque a única rota de resposta era a de
 * sessão, que exige vínculo com o projeto. O designer respondia "vou clarear
 * na v2" e o cliente convidado por link não tinha como dizer "não era isso".
 *
 * Isso nunca foi uma decisão: era a ausência de uma rota. O backend já tinha
 * decidido o oposto para LEITURA — `publico` nasce `true` e o preview devolve
 * as respostas junto dos comentários, sem filtrar `parentId`. A escrita é que
 * tinha ficado de fora.
 *
 * Estes testes rodam contra Postgres de verdade porque as duas garantias que
 * importam são do banco, não do código: que a pessoa SEM vínculo com o
 * projeto consegue responder pela porta do link (e é recusada pela porta da
 * conta), e que a resposta não escapa da arte que o token abriu. Sobre o mock
 * do Prisma as duas passariam com qualquer regra, porque é o mock que decide
 * o que as consultas devolvem.
 *
 * Rodam por `npm run test:db`.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { FeedbackService } from '../../src/services/feedbackService.js'

const prisma = new PrismaClient()
const feedbacks = new FeedbackService()

const DESIGNER = 'cdb-conversa-designer-1'
const CLIENTE = 'cdb-conversa-cliente-01'
/** Convidada pelo link, sem nenhum vínculo com o projeto. */
const DE_FORA = 'cdb-conversa-defora-01'
const PROJETO = 'cdb-conversa-projeto-1'
const ARTE = 'cdb-conversa-arte-0001'
const OUTRA_ARTE = 'cdb-conversa-arte-0002'
const OUTRO_PROJETO = 'cdb-conversa-projeto-2'

const arte = (id: string, projetoId: string, nome: string) => ({
  id,
  nome,
  arquivo: `chave/${id}.png`,
  tipo: 'IMAGEM',
  tamanho: 1024,
  projetoId,
  autorId: DESIGNER,
})

beforeAll(async () => {
  await prisma.$connect()

  await prisma.usuario.createMany({
    data: [
      { id: DESIGNER, nome: 'Designer Conversa', email: 'designer-conversa@test.com', tipo: 'DESIGNER' },
      { id: CLIENTE, nome: 'Cliente Conversa', email: 'cliente-conversa@test.com', tipo: 'CLIENTE' },
      { id: DE_FORA, nome: 'Quem Recebeu o Link', email: 'defora-conversa@test.com', tipo: 'CLIENTE' },
    ],
    skipDuplicates: true,
  })

  for (const [id, nome] of [[PROJETO, 'Projeto Conversa'], [OUTRO_PROJETO, 'Outro Projeto']] as const) {
    await prisma.projeto.upsert({
      where: { id },
      update: {},
      create: { id, nome, designerId: DESIGNER, clienteId: CLIENTE },
    })
  }

  await prisma.arte.upsert({
    where: { id: ARTE },
    update: {},
    create: arte(ARTE, PROJETO, 'A arte do link'),
  })
  await prisma.arte.upsert({
    where: { id: OUTRA_ARTE },
    update: {},
    create: arte(OUTRA_ARTE, OUTRO_PROJETO, 'Arte de outro projeto'),
  })
})

afterAll(async () => {
  await prisma.feedback.deleteMany({ where: { arteId: { in: [ARTE, OUTRA_ARTE] } } })
  await prisma.arte.deleteMany({ where: { id: { in: [ARTE, OUTRA_ARTE] } } })
  await prisma.projeto.deleteMany({ where: { id: { in: [PROJETO, OUTRO_PROJETO] } } })
  await prisma.usuario.deleteMany({ where: { id: { in: [DESIGNER, CLIENTE, DE_FORA] } } })
  await prisma.$disconnect()
})

beforeEach(async () => {
  await prisma.feedback.deleteMany({ where: { arteId: { in: [ARTE, OUTRA_ARTE] } } })
})

/** O comentário do designer, ao qual quem recebeu o link vai responder. */
async function comentarioDoDesigner(arteId = ARTE) {
  return feedbacks.createFeedback(
    { conteudo: 'Vou clarear o fundo na v2', tipo: 'TEXTO', arteId, autorId: DESIGNER },
    { via: 'projeto', isAdmin: false },
  )
}

const responderPeloLink = (parentId: string, conteudo = 'Não era isso, o problema é o contraste') =>
  feedbacks.createFeedback(
    { conteudo, tipo: 'TEXTO', arteId: ARTE, autorId: DE_FORA, parentId },
    { via: 'link' },
  )

describe('responder pela porta do link', () => {
  it('quem não é do projeto responde, porque quem autorizou foi o token', async () => {
    const pai = await comentarioDoDesigner()
    const resposta: any = await responderPeloLink(pai.id)

    expect(resposta.id).toBeTruthy()
    expect(resposta.parentId).toBe(pai.id)
    expect(resposta.autorId).toBe(DE_FORA)
  })

  it('e a mesma pessoa é recusada pela porta da conta', async () => {
    /*
     * O contraste é o ponto: a regra não afrouxou. Continua valendo que sem
     * vínculo com o projeto não se escreve na arte — o que muda é que o token
     * passou a ser uma forma legítima de autorização para a conversa, do mesmo
     * jeito que já era para o comentário.
     */
    const pai = await comentarioDoDesigner()

    await expect(
      feedbacks.createFeedback(
        { conteudo: 'pela porta errada', tipo: 'TEXTO', arteId: ARTE, autorId: DE_FORA, parentId: pai.id },
        { via: 'projeto', isAdmin: false },
      ),
    ).rejects.toThrow()
  })

  it('a resposta volta na conversa, e não num canto só dela', async () => {
    // `publico` nasce `true`, e é por isso que o preview do link devolve a
    // resposta junto. Se nascesse `false`, o cliente escreveria e ninguém
    // leria — o laço continuaria aberto, só que em silêncio.
    const pai = await comentarioDoDesigner()
    const resposta: any = await responderPeloLink(pai.id)

    expect(resposta.publico).toBe(true)

    const daArte = await prisma.feedback.findMany({
      where: { arteId: ARTE, publico: true },
      select: { id: true },
    })
    expect(daArte.map((f) => f.id)).toContain(resposta.id)
  })
})

describe('o limite do token', () => {
  it('não dá para responder a um comentário de OUTRA arte', async () => {
    /*
     * A garantia que sustenta tudo isto. O token abre UMA arte; sem este
     * limite, quem recebesse um link qualquer poderia escrever na conversa de
     * qualquer peça do sistema, bastando ter o id de um comentário de lá.
     */
    const alheio = await feedbacks.createFeedback(
      { conteudo: 'comentário de outro projeto', tipo: 'TEXTO', arteId: OUTRA_ARTE, autorId: DESIGNER },
      { via: 'projeto', isAdmin: false },
    )

    await expect(
      feedbacks.createFeedback(
        { conteudo: 'invadindo a conversa', tipo: 'TEXTO', arteId: ARTE, autorId: DE_FORA, parentId: alheio.id },
        { via: 'link' },
      ),
    ).rejects.toThrow(/outra arte|não encontrado/i)

    const naOutra = await prisma.feedback.count({ where: { parentId: alheio.id } })
    expect(naOutra).toBe(0)
  })

  it('nem a um pai que não existe', async () => {
    await expect(
      feedbacks.createFeedback(
        { conteudo: 'pai fantasma', tipo: 'TEXTO', arteId: ARTE, autorId: DE_FORA, parentId: 'cnao-existe-000000001' },
        { via: 'link' },
      ),
    ).rejects.toThrow(/outra arte|não encontrado/i)
  })
})

describe('o que não mudou', () => {
  it('comentar pelo link continua funcionando, sem pai', async () => {
    const solto: any = await feedbacks.createFeedback(
      { conteudo: 'primeiro comentário', tipo: 'TEXTO', arteId: ARTE, autorId: DE_FORA },
      { via: 'link' },
    )
    expect(solto.parentId).toBeNull()
  })

  it('a resposta fica na mesma arte do pai', async () => {
    const pai = await comentarioDoDesigner()
    const resposta: any = await responderPeloLink(pai.id)
    expect(resposta.arteId).toBe(ARTE)
  })
})
