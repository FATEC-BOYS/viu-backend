import { FastifyRequest, FastifyReply } from 'fastify'
import { funilService } from '../services/funilService.js'
import { erroInterno } from '../utils/erroInterno.js'

export async function getFunil(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    /*
     * O funil é de quem entrega. Um cliente perguntando aqui receberia zero —
     * as artes são dos projetos em que ele é cliente, não designer — e zero é
     * pior que uma recusa: parece resposta.
     */
    if (usuario.tipo !== 'DESIGNER' && usuario.tipo !== 'ADMIN') {
      reply.status(403).send({ message: 'Este panorama é de quem entrega.', success: false })
      return
    }

    const data = await funilService.funilDoDesigner(usuario.id)
    reply.send({ data, success: true })
  } catch (error) {
    erroInterno(request, reply, error, 'Erro ao montar o funil')
  }
}
