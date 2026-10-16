import prisma from '../database/client.js'

/** Carteira por designer: clientes dos projetos e contatos salvos explicitamente. */

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
    const [projetos, vinculosRows] = await Promise.all([
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
        where: { designerId, ...(clienteId ? { clienteId } : {}) },
        select: { clienteId: true, rompidoEm: true, cliente: { select: { id: true, nome: true, email: true, telefone: true, avatar: true, criadoEm: true } } },
      }),
    ])

    const rompidos = new Set(vinculosRows.filter((v) => v.rompidoEm !== null).map((v) => v.clienteId))

    // Um cliente pode ter vários projetos; a carteira é por pessoa.
    const porCliente = new Map<string, { cliente: any; projetos: any[] }>()
    for (const p of projetos) {
      if (!p.cliente?.id) continue
      const atual = porCliente.get(p.cliente.id)
      if (atual) atual.projetos.push(p)
      else porCliente.set(p.cliente.id, { cliente: p.cliente, projetos: [p] })
    }

    // Inclui contatos cadastrados sem projeto, mantendo o escopo do designer.
    for (const vinculo of vinculosRows) {
      if (vinculo.cliente?.id && !porCliente.has(vinculo.cliente.id)) {
        porCliente.set(vinculo.cliente.id, { cliente: vinculo.cliente, projetos: [] })
      }
    }

    return [...porCliente.values()].map(({ cliente, projetos }) =>
      montarCliente(cliente, projetos, rompidos),
    )
  }

  /** Sem projeto em comum ou vínculo explícito, não revela o cadastro. */
  async getCliente(designerId: string, clienteId: string) {
    const [cliente] = await this.listarClientes(designerId, clienteId)
    return cliente ?? null
  }
}

const _svc = new ClienteService()
export const listarClientes = (...a: Parameters<ClienteService['listarClientes']>) =>
  _svc.listarClientes(...a)
export const getCliente = (...a: Parameters<ClienteService['getCliente']>) => _svc.getCliente(...a)
