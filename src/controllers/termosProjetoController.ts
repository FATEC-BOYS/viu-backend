import { FastifyRequest, FastifyReply } from 'fastify'
import prisma from '../database/client.js'
import { erroInterno } from '../utils/erroInterno.js'
import {
  termosProjetoService,
  camposFaltantes,
  termosCompletos,
} from '../services/termosProjetoService.js'
import { renderizarAnexo, TEMPLATE_VERSAO, TEMPLATE_REVISADO_JURIDICAMENTE } from '../templates/anexoRevisao.js'

/**
 * Quem pode ver os termos de um projeto.
 *
 * As duas partes e o ADMIN. O cliente precisa ler — é ele quem vai aceitar — e
 * a rota é a mesma, porque duas rotas para o mesmo dado divergem: foi assim
 * que a fatura acabou com duas rotas formatando valores de jeitos diferentes.
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

export async function getTermosHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
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

    const termos = await termosProjetoService.getTermos(projetoId)

    /*
     * `faltam` vai junto de propósito. A tela precisa dizer o que falta, e sem
     * isto ela recalcularia a mesma regra por conta própria — duas listas que
     * divergem no primeiro campo novo.
     */
    reply.send({
      data: termos,
      completos: termosCompletos(termos),
      faltam: camposFaltantes(termos),
      success: true,
    })
  } catch (erro) {
    erroInterno(request, reply, erro, 'Erro ao buscar os termos do projeto')
  }
}

export async function salvarTermosHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { projetoId } = request.params as { projetoId: string }

    const termos = await termosProjetoService.salvarTermos(projetoId, usuario.id, request.body as any)

    reply.send({
      data: termos,
      completos: termosCompletos(termos),
      faltam: camposFaltantes(termos),
      success: true,
    })
  } catch (error: any) {
    if (error.message?.includes('Apenas o designer')) {
      reply.status(403).send({ message: error.message, success: false })
      return
    }
    if (error.message?.includes('não encontrado')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    erroInterno(request, reply, error, 'Erro ao salvar os termos do projeto')
  }
}

/**
 * O anexo renderizado a partir dos termos atuais — uma prévia, não o contrato.
 *
 * O contrato de valer é `ContratoProjeto`, com texto congelado e hash. Este
 * endpoint existe para a pessoa ler antes de gerar, e por isso devolve
 * `revisadoJuridicamente` junto: a tela desenha o aviso a partir do dado, não
 * de um texto que alguém precise lembrar de apagar quando o advogado devolver.
 */
export async function previewAnexoHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { projetoId } = request.params as { projetoId: string }

    const { autorizado } = await podeVer(projetoId, usuario)
    if (!autorizado) {
      reply.status(403).send({ message: 'Acesso negado', success: false })
      return
    }

    const projeto = await prisma.projeto.findUnique({
      where: { id: projetoId },
      include: {
        designer: { select: { id: true, nome: true, email: true } },
        cliente: { select: { id: true, nome: true, email: true } },
        termos: true,
      },
    })
    if (!projeto) {
      reply.status(404).send({ message: 'Projeto não encontrado', success: false })
      return
    }

    const t = projeto.termos
    const texto = renderizarAnexo({
      partes: { designer: projeto.designer, cliente: projeto.cliente },
      projeto: {
        id: projeto.id,
        nome: projeto.nome,
        descricao: projeto.descricao,
        orcamentoCentavos: projeto.orcamento,
        prazo: projeto.prazo?.toISOString() ?? null,
      },
      termos: {
        rodadasIncluidas: t?.rodadasIncluidas ?? null,
        prazoRevisaoDiasUteis: t?.prazoRevisaoDiasUteis ?? null,
        licencaFinalidade: t?.licencaFinalidade ?? null,
        licencaTerritorio: t?.licencaTerritorio ?? null,
        licencaPrazo: t?.licencaPrazo ?? null,
        licencaPrazoAte: t?.licencaPrazoAte?.toISOString() ?? null,
        exclusividade: t?.exclusividade ?? null,
        exclusividadeAte: t?.exclusividadeAte?.toISOString() ?? null,
        arquivosFonte: t?.arquivosFonte ?? null,
      },
      geradoEm: new Date().toISOString(),
    })

    reply.send({
      data: {
        texto,
        templateVersao: TEMPLATE_VERSAO,
        revisadoJuridicamente: TEMPLATE_REVISADO_JURIDICAMENTE,
        completos: termosCompletos(t),
        faltam: camposFaltantes(t),
      },
      success: true,
    })
  } catch (erro) {
    erroInterno(request, reply, erro, 'Erro ao gerar a prévia do anexo')
  }
}
