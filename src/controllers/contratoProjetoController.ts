import { FastifyRequest, FastifyReply } from 'fastify'
import prisma from '../database/client.js'
import { erroInterno } from '../utils/erroInterno.js'
import {
  contratoProjetoService,
  TERMOS_INCOMPLETOS,
} from '../services/contratoProjetoService.js'
import { camposFaltantes } from '../services/termosProjetoService.js'

/**
 * As duas partes leem; só o designer gera. Mesma divisão de `salvarTermos` e de
 * `criarFatura`, porque é a mesma decisão — o que vai ser cobrado e sob quais
 * condições. O cliente lê e aceita.
 */
async function podeVer(projetoId: string, usuario: { id: string; tipo: string }) {
  const projeto = await prisma.projeto.findUnique({
    where: { id: projetoId },
    select: { id: true, designerId: true, clienteId: true },
  })
  if (!projeto) return { projeto: null, autorizado: false }
  const autorizado =
    usuario.tipo === 'ADMIN' || projeto.designerId === usuario.id || projeto.clienteId === usuario.id
  return { projeto, autorizado }
}

export async function getContratoVigenteHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { projetoId } = request.params as { projetoId: string }

    const { projeto, autorizado } = await podeVer(projetoId, usuario)
    if (!projeto) {
      reply.status(404).send({ message: 'Projeto não encontrado', success: false })
      return
    }
    if (!autorizado) {
      reply.status(403).send({ message: 'Acesso negado', success: false })
      return
    }

    const contrato = await contratoProjetoService.vigente(projetoId)
    const aceite = await contratoProjetoService.estadoDeAceite(projetoId, usuario.id)

    /*
     * `faltam` vai junto porque a tela precisa dizer o que impede gerar, e sem
     * isto ela recalcularia a mesma regra por conta própria — duas listas que
     * divergem no primeiro campo novo.
     */
    const termos = await prisma.termosProjeto.findUnique({ where: { projetoId } })

    /*
     * Os termos mudaram depois de o contrato ser gerado?
     *
     * Sem esta resposta a tela afirmava "Combinado e aceito pelas duas partes"
     * sobre um documento que descreve outro acordo — e é esse documento que
     * decide de quem é a peça se a conta não for paga. Só aqui dá para saber:
     * exige o template e os dados do projeto.
     *
     * `false` quando não há contrato: não existe documento para estar velho, e
     * a tela já trata "sem contrato" como passo próprio.
     */
    const desatualizado = contrato
      ? await contratoProjetoService.desatualizado(projetoId, contrato)
      : false

    reply.send({
      data: contrato,
      aceite,
      termosFaltantes: camposFaltantes(termos),
      desatualizado,
      success: true,
    })
  } catch (erro) {
    erroInterno(request, reply, erro, 'Erro ao buscar o contrato do projeto')
  }
}

export async function historicoContratoHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { projetoId } = request.params as { projetoId: string }

    const { autorizado } = await podeVer(projetoId, usuario)
    if (!autorizado) {
      reply.status(403).send({ message: 'Acesso negado', success: false })
      return
    }

    reply.send({ data: await contratoProjetoService.historico(projetoId), success: true })
  } catch (erro) {
    erroInterno(request, reply, erro, 'Erro ao listar as versões do contrato')
  }
}

export async function gerarContratoHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { projetoId } = request.params as { projetoId: string }

    const contrato = await contratoProjetoService.gerar(projetoId, usuario.id)
    reply.status(201).send({ data: contrato, success: true })
  } catch (error: any) {
    if (error.message?.includes('Apenas o designer')) {
      reply.status(403).send({ message: error.message, success: false })
      return
    }
    if (error.message === TERMOS_INCOMPLETOS) {
      // 409 e não 400: o corpo da requisição está correto; o que falta é estado
      // do projeto. A tela usa a distinção para mandar a pessoa preencher os
      // termos em vez de procurar erro no que ela enviou.
      reply.status(409).send({ message: error.message, success: false })
      return
    }
    if (error.message?.includes('não encontrado')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    erroInterno(request, reply, error, 'Erro ao gerar o contrato')
  }
}

export async function aceitarContratoHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { contratoId } = request.params as { contratoId: string }

    /*
     * IP e user-agent entram aqui, e não no serviço, porque são da requisição.
     * `x-forwarded-for` vem antes de `request.ip` quando existe: atrás de proxy,
     * `request.ip` é o do proxy, e registrar o endereço do próprio servidor
     * como prova de quem aceitou não prova coisa alguma.
     */
    const ip =
      request.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || request.ip
    const userAgent = request.headers['user-agent']

    const aceite = await contratoProjetoService.aceitar(contratoId, usuario.id, { ip, userAgent })
    reply.status(201).send({ data: aceite, success: true })
  } catch (error: any) {
    if (error.message?.includes('Acesso negado')) {
      reply.status(403).send({ message: error.message, success: false })
      return
    }
    if (error.message?.includes('não é mais a vigente')) {
      reply.status(409).send({ message: error.message, success: false })
      return
    }
    if (error.message?.includes('não encontrado')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    erroInterno(request, reply, error, 'Erro ao registrar o aceite')
  }
}
