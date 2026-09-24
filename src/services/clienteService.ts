import prisma from '../database/client.js'

/**
 * A carteira de clientes de um designer.
 *
 * Existia só no navegador, e por um caminho caro: as duas telas de cliente
 * chamavam `getAll('/projetos')` — que pagina de cem em cem até vinte páginas —
 * e agrupavam os clientes em memória. Para desenhar uma lista de cinco pessoas,
 * o app baixava todos os projetos do designer.
 *
 * Pior que o custo é o silêncio: `getAll` para na vigésima página sem avisar.
 * Passando de dois mil projetos, um cliente simplesmente não aparece na
 * carteira — e em `/clientes/[id]` o efeito é a tela afirmar "Cliente não
 * encontrado na sua carteira" sobre alguém que está lá.
 *
 * `GET /usuarios` é restrito a ADMIN, e era por isso que o caminho nascia
 * torto. Mas a pergunta "quem são meus clientes" tem resposta direta no banco:
 * os clientes dos projetos deste designer. É o mesmo escopo que ele já podia
 * enxergar — só que agora lido de uma vez, por quem tem o índice.
 */

/** Um cliente e os projetos que ele tem com este designer. */
function montarCliente(cliente: any, projetos: any[], rompidos: Set<string>) {
  return {
    id: cliente.id,
    nome: cliente.nome,
    email: cliente.email,
    telefone: cliente.telefone ?? null,
    avatar: cliente.avatar ?? null,
    /*
     * O laço rompido vem resolvido daqui.
     *
     * A tela fazia uma segunda requisição a `/vinculos/rompidos` e montava um
     * Set para cruzar. Duas chamadas para uma pergunta que é uma só, e que o
     * banco responde no mesmo fôlego.
     */
    vinculado: !rompidos.has(cliente.id),
    criadoEm: cliente.criadoEm,
    projetos: projetos.map((p) => ({
      id: p.id,
      nome: p.nome,
      descricao: p.descricao ?? null,
      status: p.status,
      orcamento: p.orcamento ?? null,
      prazo: p.prazo ?? null,
      criadoEm: p.criadoEm,
    })),
  }
}

export class ClienteService {
  /**
   * `clienteId` estreita para um só — é o que a tela de detalhe precisa, e
   * evita que ela baixe a carteira inteira para mostrar uma pessoa.
   */
  async listarClientes(designerId: string, clienteId?: string) {
    const [projetos, rompidosRows] = await Promise.all([
      prisma.projeto.findMany({
        where: { designerId, ...(clienteId ? { clienteId } : {}) },
        select: {
          id: true,
          nome: true,
          descricao: true,
          status: true,
          orcamento: true,
          prazo: true,
          criadoEm: true,
          cliente: {
            select: { id: true, nome: true, email: true, telefone: true, avatar: true, criadoEm: true },
          },
        },
        /*
         * Quem tem prazo primeiro, do mais urgente ao menos — a ordem em que o
         * trabalho cobra. A tela ordenava assim em memória; sai daqui porque
         * ordenar é do banco, e porque assim as duas telas concordam sem cada
         * uma reimplementar a regra.
         */
        orderBy: [{ prazo: { sort: 'asc', nulls: 'last' } }, { criadoEm: 'desc' }],
      }),
      prisma.vinculoCliente.findMany({
        where: { designerId, rompidoEm: { not: null } },
        select: { clienteId: true },
      }),
    ])

    const rompidos = new Set(rompidosRows.map((v) => v.clienteId))

    // Um cliente pode ter vários projetos; a carteira é por pessoa.
    const porCliente = new Map<string, { cliente: any; projetos: any[] }>()
    for (const p of projetos) {
      if (!p.cliente?.id) continue
      const atual = porCliente.get(p.cliente.id)
      if (atual) atual.projetos.push(p)
      else porCliente.set(p.cliente.id, { cliente: p.cliente, projetos: [p] })
    }

    return [...porCliente.values()].map(({ cliente, projetos }) =>
      montarCliente(cliente, projetos, rompidos),
    )
  }

  /** `null` quando não há projeto em comum — que é o que "não é meu cliente"
   *  significa aqui. */
  async getCliente(designerId: string, clienteId: string) {
    const [cliente] = await this.listarClientes(designerId, clienteId)
    return cliente ?? null
  }
}

const _svc = new ClienteService()
export const listarClientes = (...a: Parameters<ClienteService['listarClientes']>) =>
  _svc.listarClientes(...a)
export const getCliente = (...a: Parameters<ClienteService['getCliente']>) => _svc.getCliente(...a)
