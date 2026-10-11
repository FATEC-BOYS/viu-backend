/**
 * A busca de pessoas acha quem tem acento no nome, contra Postgres de verdade.
 *
 * Esta afirmação só pode ser feita com banco. O `mode: 'insensitive'` do
 * Prisma vira `ILIKE`, que no Postgres é insensível a CAIXA e sensível a
 * ACENTO — e nenhum mock do Prisma reproduz isso: ele compara strings em
 * JavaScript, onde a diferença entre "João" e "joao" é a mesma que entre
 * "João" e "Maria". Um teste sobre o mock passaria com o bug presente.
 *
 * O bug era real e medido: `nome ILIKE '%joao%'` devolvia zero linhas com
 * "João Santos" cadastrado. Num produto brasileiro isso quebra a busca na
 * prática — metade dos nomes de cliente tem acento e ninguém digita acento
 * num campo de busca. Quem procurava "jose" concluía que a pessoa não estava
 * cadastrada e cadastrava de novo.
 *
 * O teste cobre os dois sentidos de propósito. Normalizar só o que está no
 * banco deixaria de achar quem digita COM acento — que é o que acontece
 * quando a pessoa escolhe o nome do contato na lista do telefone.
 *
 * Rodam por `npm run test:db`, que sobe o cluster e aplica as migrações —
 * inclusive a que instala a extensão `unaccent`. Se a migration não for
 * aplicada, estes testes falham, que é o ponto.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { UsuarioService } from '../../src/services/usuarioService.js'

const prisma = new PrismaClient()
const usuarios = new UsuarioService()

const JOSE = 'cdb-usuario-acento-00001'
const ANTONIO = 'cdb-usuario-acento-00002'
const INATIVO = 'cdb-usuario-acento-00003'

beforeAll(async () => {
  await prisma.usuario.deleteMany({ where: { id: { in: [JOSE, ANTONIO, INATIVO] } } })
  await prisma.usuario.createMany({
    data: [
      { id: JOSE, email: 'jose.acento@teste.com', nome: 'José da Conceição', tipo: 'CLIENTE' },
      { id: ANTONIO, email: 'antonio.acento@teste.com', nome: 'Antônio Araújo', tipo: 'DESIGNER' },
      {
        id: INATIVO,
        email: 'inativo.acento@teste.com',
        nome: 'Inácio Inativo',
        tipo: 'CLIENTE',
        ativo: false,
      },
    ],
  })
})

afterAll(async () => {
  await prisma.usuario.deleteMany({ where: { id: { in: [JOSE, ANTONIO, INATIVO] } } })
  await prisma.$disconnect()
})

const nomes = (lista: { nome: string }[]) => lista.map((u) => u.nome)

describe('busca de pessoas, com e sem acento', () => {
  it('acha "José" digitando "jose"', async () => {
    expect(nomes(await usuarios.buscarUsuarios('jose'))).toContain('José da Conceição')
  })

  it('acha "Antônio" digitando "antonio"', async () => {
    expect(nomes(await usuarios.buscarUsuarios('antonio'))).toContain('Antônio Araújo')
  })

  it('acha "Araújo" digitando "araujo"', async () => {
    expect(nomes(await usuarios.buscarUsuarios('araujo'))).toContain('Antônio Araújo')
  })

  it('continua achando quem digita COM acento', async () => {
    // O caminho de quem escolhe o contato na lista do telefone, onde o nome
    // já vem acentuado. Normalizar só o lado do banco perderia este caso.
    expect(nomes(await usuarios.buscarUsuarios('José'))).toContain('José da Conceição')
    expect(nomes(await usuarios.buscarUsuarios('Araújo'))).toContain('Antônio Araújo')
  })

  it('segue insensível a caixa, que já funcionava', async () => {
    expect(nomes(await usuarios.buscarUsuarios('CONCEICAO'))).toContain('José da Conceição')
  })

  it('acha pelo e-mail também', async () => {
    expect(nomes(await usuarios.buscarUsuarios('jose.acento'))).toContain('José da Conceição')
  })

  it('não devolve quem está inativo', async () => {
    // A condição `ativo = true` saiu do query builder para o SQL cru junto
    // com o resto; perdê-la na tradução devolveria contas desativadas.
    expect(nomes(await usuarios.buscarUsuarios('inacio'))).not.toContain('Inácio Inativo')
  })

  it('respeita o limite pedido', async () => {
    // `LIMIT` também passou a ser parâmetro no SQL cru.
    const achados = await usuarios.buscarUsuarios('acento', 1)
    expect(achados.length).toBeLessThanOrEqual(1)
  })

  it('não devolve ninguém para um termo que não casa', async () => {
    expect(await usuarios.buscarUsuarios('zzzznaoexiste')).toHaveLength(0)
  })

  it('trata o termo como valor, não como SQL', async () => {
    /*
     * A interpolação é por tagged template, que o Prisma manda como parâmetro
     * do driver — não como concatenação. Um termo com aspas e ponto-e-vírgula
     * precisa voltar vazio, e não derrubar a consulta nem apagar nada.
     */
    const perigoso = "'; DROP TABLE usuarios; --"
    await expect(usuarios.buscarUsuarios(perigoso)).resolves.toHaveLength(0)
    expect(await prisma.usuario.count({ where: { id: JOSE } })).toBe(1)
  })

  it('o curinga do LIKE digitado não vira curinga', async () => {
    // Parâmetro de driver não protege disto: `%` e `_` viajam dentro do valor
    // e o ILIKE os interpreta. Sem escapar, "%" sozinho lista a base inteira.
    expect(await usuarios.buscarUsuarios('%')).toHaveLength(0)
    expect(await usuarios.buscarUsuarios('%%%')).toHaveLength(0)
  })

  it('underscore digitado é underscore, e não "qualquer letra"', async () => {
    /*
     * Importa por causa de e-mail: `joao_silva@` é um endereço comum, e com o
     * `_` valendo como curinga ele casaria também com `joaoXsilva@` — a busca
     * devolvendo uma pessoa que não é a procurada.
     */
    expect(nomes(await usuarios.buscarUsuarios('Jos_ da'))).not.toContain('José da Conceição')
    expect(nomes(await usuarios.buscarUsuarios('José da'))).toContain('José da Conceição')
  })
})
