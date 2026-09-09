import { FastifyRequest, FastifyReply } from 'fastify'
import prisma from '../database/client.js'
import { env } from '../config/env.js'
import { criarJanelaDeslizante } from '../utils/limiteEmMemoria.js'

/**
 * Limites de criação de conta.
 *
 * O cadastro tinha duas portas para o mesmo handler — `POST /auth/register` e
 * `POST /usuarios` — cada uma com seu balde de 5 por 15 minutos no
 * @fastify/rate-limit. Quem alternasse entre elas levava o dobro. `/usuarios`
 * passou a exigir sessão (é o designer cadastrando o cliente dele), e o
 * cadastro público ficou com uma porta só e um limite só.
 *
 * São duas camadas medindo coisas diferentes, de propósito:
 *
 * - **hora, em memória**: conta *tentativas*. Segura o script martelando o
 *   formulário. Perder o estado num restart é aceitável nessa janela.
 * - **dia, no banco**: conta *contas efetivamente criadas* (AuditLog REGISTER
 *   com status SUCCESS). Sobrevive a deploy — e num beta se publica muito,
 *   então um contador em memória de 24h seria ficção.
 *
 * Contar só sucesso no teto diário não é detalhe de estilo: tentativa também
 * vira linha de auditoria, então as próprias respostas 429 alimentariam o
 * contador e o bloqueio se renovaria sozinho, sem fim. E quem errou a senha
 * três vezes não deve gastar cota de cadastro por isso.
 */

const UMA_HORA_MS = 60 * 60 * 1000
const UM_DIA_MS = 24 * UMA_HORA_MS

const tentativasDeCadastro = criarJanelaDeslizante(UMA_HORA_MS)
const clientesCriados = criarJanelaDeslizante(UMA_HORA_MS)

/** Os testes precisam de histórico limpo entre casos. */
export function limparHistoricoDeRegistro(): void {
  tentativasDeCadastro.limpar()
  clientesCriados.limpar()
}

export async function limitarRegistroPublico(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const agora = Date.now()
  const ip = request.ip

  if (tentativasDeCadastro.registrar(ip, agora) > env.REGISTRO_MAX_HORA) {
    reply.header('retry-after', '3600')
    reply.status(429).send({
      message: 'Muitas tentativas de cadastro. Espere um pouco e tente de novo.',
      success: false,
    })
    return
  }

  try {
    const criadasHoje = await prisma.auditLog.count({
      where: {
        action: 'REGISTER',
        status: 'SUCCESS',
        ipAddress: ip,
        criadoEm: { gt: new Date(agora - UM_DIA_MS) },
      },
    })

    if (criadasHoje >= env.REGISTRO_MAX_DIA) {
      reply.header('retry-after', '86400')
      reply.status(429).send({
        message: 'Limite de cadastros por dia atingido. Tente novamente amanhã.',
        success: false,
      })
    }
  } catch (erro) {
    // Banco fora não pode virar porta aberta nem porta trancada. A camada da
    // hora já respondeu por esta requisição, então seguir é o desfecho menos
    // surpreendente — e o problema aparece no log em vez de sumir.
    request.log.warn({ erro }, 'Não foi possível checar o teto diário de cadastros')
  }
}

/**
 * Teto do designer que cadastra clientes pelo wizard. A chave é o usuário, e
 * não o IP: um estúdio inteiro atrás do mesmo IP não pode dividir a mesma
 * cota, e a conta é que responde pelo que ela cria.
 */
export async function limitarCriacaoDeCliente(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const usuario = (request as any).usuario
  if (!usuario?.id) return // sem sessão: quem responde é o authenticate

  if (clientesCriados.registrar(usuario.id) > env.CLIENTES_MAX_HORA) {
    reply.header('retry-after', '3600')
    reply.status(429).send({
      message: 'Muitos clientes cadastrados em pouco tempo. Espere um pouco e tente de novo.',
      success: false,
    })
  }
}
