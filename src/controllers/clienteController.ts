import { FastifyRequest, FastifyReply } from 'fastify'
import { listarClientes, getCliente } from '../services/clienteService.js'
import { erroInterno } from '../utils/erroInterno.js'

export async function listarClientesHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const clientes = await listarClientes(usuario.id)
    reply.send({ data: clientes, success: true })
  } catch (erro) {
    erroInterno(request, reply, erro, 'Erro ao listar clientes')
  }
}

export async function getClienteHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { id } = request.params as { id: string }
    const cliente = await getCliente(usuario.id, id)
    if (!cliente) {
      /*
       * 404 e não 403: do ponto de vista deste designer o cliente não existe,
       * e dizer "acesso negado" confirmaria que a conta existe para outra
       * pessoa — que é justamente o que o escopo por projeto evita contar.
       */
      reply.status(404).send({ message: 'Cliente não encontrado na sua carteira', success: false })
      return
    }
    reply.send({ data: cliente, success: true })
  } catch (erro) {
    erroInterno(request, reply, erro, 'Erro ao buscar cliente')
  }
}
