import prisma from '../database/client.js'
import { mpPayment } from './mercadoPagoService.js'
import { formatCurrency, formatDate, formatDateOnly } from '../utils/formatters.js'
import { assertValidTransition, FATURA_TRANSITIONS } from '../utils/stateMachine.js'
import { notificacaoService } from './notificacaoService.js'
import { pendenciaDeContrato, ContratoPendenteError } from './contratoProjetoService.js'
import { planoVigente } from './assinaturaVigente.js'
import { env } from '../config/env.js'

/**
 * Último recurso, quando não há NENHUM plano gratuito de designer cadastrado.
 *
 * Não dá para apagar: sem ela, um banco sem planos deixaria de conseguir emitir
 * fatura — pior do que cobrar a taxa base. Mas ela deixou de ser o caminho
 * normal: a migration `20260913050000_planos_designer` cadastra o Gratuito, e é
 * de lá que a taxa passa a sair.
 */
const TAXA_PADRAO = 0.10

/**
 * Quanto a plataforma retém deste designer.
 *
 * Quem não assina nada ESTÁ no plano gratuito — a ausência de assinatura é o
 * plano, não a ausência de plano. Antes disto o código lia a taxa do banco só
 * para quem assinava e caía numa constante para todo o resto; como ninguém
 * assina no beta, a taxa de toda fatura vinha do código, e mudá-la exigia
 * deploy. Agora a linha do Gratuito responde pelos dois casos, e a tela de
 * administração de planos passa a valer para valer.
 */
async function taxaDoDesigner(designerId: string): Promise<number> {
  /*
   * Uma leitura só, compartilhada com o teto de recursos e com a tela de
   * assinatura. Antes cada um decidia por conta própria o que vale quando não
   * há assinatura — este caía no Gratuito, o middleware de limites caía nas
   * variáveis BETA_MAX_* — e bastava mexer num para o designer ser cobrado
   * pela taxa de um plano e limitado pelos tetos de outro.
   */
  const plano = await planoVigente(designerId)
  return plano?.taxaPlataforma ?? TAXA_PADRAO
}

/**
 * Os campos formatados que a interface lê.
 *
 * Isto vivia inline dentro de `listarFaturas`, e `getFaturaById` devolvia a
 * linha crua do Prisma. As duas rotas descrevem a mesma fatura, mas só uma
 * trazia `valorFormatado`, `taxaPlataformaFormatada` e
 * `valorLiquidoDesignerFormatado` — e a tela de detalhe, que lê esses campos,
 * desenhava "Valor total", "Taxa plataforma" e "Designer recebe" em branco.
 *
 * Uma função só, usada pelas duas, para não voltar a divergir.
 */
function comValoresFormatados<T extends {
  status: string
  valor: number
  taxaPlataforma: number
  valorLiquidoDesigner: number
  dataVencimento: Date | null
  dataPagamento: Date | null
}>(f: T, mostrarRepasse: boolean) {
  const { taxaPlataforma, valorLiquidoDesigner, ...semRepasse } = f

  const base = {
    valorFormatado: formatCurrency(f.valor),
    // Vencimento é dia, não instante. `dataPagamento` continua com hora:
    // ali o momento em que o dinheiro entrou importa.
    dataVencimentoFormatada: f.dataVencimento ? formatDateOnly(f.dataVencimento) : null,
    dataPagamentoFormatada: f.dataPagamento ? formatDate(f.dataPagamento) : null,
    /*
     * Vencida é um fato, não uma conta da tela.
     *
     * A lista mostrava "Vence 15 de set." em cinza para uma fatura cinco dias
     * atrasada — numa tela chamada "o que você tem a pagar", atraso é o dado
     * mais acionável e não aparecia em lugar nenhum. Sai daqui porque o
     * servidor tem a data e o relógio; deixar a comparação para o navegador é
     * deixá-la para um relógio que pode estar em outro fuso ou errado.
     */
    vencida:
      f.status === 'PENDENTE' && f.dataVencimento !== null && f.dataVencimento < new Date(),
  }

  /*
   * O repasse só vai para quem ele diz respeito.
   *
   * A fatura do cliente trazia `taxaPlataforma` e `valorLiquidoDesigner`, e a
   * tela os desenhava: quem pagava R$ 12.000 lia quanto o VIU cobra e quanto o
   * designer embolsa. Esconder isso só no componente não resolveria — o número
   * continuaria no corpo da resposta, a um devtools de distância. Some aqui.
   */
  if (!mostrarRepasse) return { ...semRepasse, ...base }

  return {
    ...f,
    ...base,
    taxaPlataformaFormatada: formatCurrency(taxaPlataforma),
    valorLiquidoDesignerFormatado: formatCurrency(valorLiquidoDesigner),
  }
}

/**
 * Uma frase só para as duas defesas.
 *
 * A checagem no código e o índice no banco recusam a mesma coisa, e quem está
 * do outro lado não precisa saber qual das duas pegou: o controller casa
 * `/ja existe/` e devolve 409 nos dois casos.
 */
const FATURA_ATIVA_EXISTENTE = 'Já existe uma fatura ativa para este projeto'

/**
 * O que o Postgres devolve quando o índice parcial recusa a segunda fatura.
 *
 * Contra banco de verdade o Prisma preenche `meta.target` com a LISTA DE
 * CAMPOS do índice — `["projetoId"]` — e não com o nome dele. A primeira
 * versão deste arquivo procurava por `faturas_uma_ativa_por_projeto` ali
 * dentro, coisa que nunca aparece, então a P2002 escapava crua e quem perdia
 * a corrida levava 500 em vez do 409 previsto. O teste contra mock não pegou
 * porque o mock devolvia o formato que o código esperava, e não o que o
 * Postgres devolve: um teste assim confirma a suposição de quem o escreveu.
 *
 * Aceita as duas formas de propósito. `faturas` não tem nenhuma outra
 * restrição de unicidade sobre `projetoId` (o `@@index([projetoId])` do schema
 * não é único), então casar pelo campo não confunde este índice com outro.
 */
function eDuplicataDeFaturaAtiva(erro: any): boolean {
  if (erro?.code !== 'P2002') return false

  const alvo = erro?.meta?.target
  const campos = Array.isArray(alvo) ? alvo : [alvo]

  return campos.some(
    (campo) =>
      typeof campo === 'string' &&
      (campo === 'projetoId' || campo.includes('faturas_uma_ativa_por_projeto')),
  )
}

/**
 * Cria a fatura convertendo a violação do índice único na mesma recusa de
 * negócio. Perder a corrida não é erro de servidor — é a regra funcionando.
 */
async function criarOuRecusarDuplicata(args: Parameters<typeof prisma.fatura.create>[0]) {
  try {
    return await prisma.fatura.create(args)
  } catch (erro: any) {
    if (eDuplicataDeFaturaAtiva(erro)) {
      throw new Error(FATURA_ATIVA_EXISTENTE)
    }
    throw erro
  }
}

export class FaturaService {
  async criarFatura(
    projetoId: string,
    requesterId: string,
    descricao?: string,
    dataVencimento?: string,
  ) {
    const projeto = await prisma.projeto.findUnique({ where: { id: projetoId } })
    if (!projeto) throw new Error('Projeto não encontrado')
    if (!projeto.orcamento) throw new Error('Projeto não possui orçamento definido')

    const requester = await prisma.usuario.findUnique({ where: { id: requesterId } })
    if (projeto.designerId !== requesterId && requester?.tipo !== 'ADMIN') {
      throw new Error('Apenas o designer do projeto pode criar faturas')
    }

    /*
     * A checagem continua porque é ela que dá a mensagem boa no caso comum —
     * a pessoa clica, já existe fatura, e lê o motivo. O que ela NÃO faz é
     * garantir a regra: entre este `findFirst` e o `create` lá embaixo cabe
     * outra requisição inteira. Duas simultâneas leem "não existe" as duas e
     * inserem as duas. Quem garante é o índice parcial
     * `faturas_uma_ativa_por_projeto`, no banco; aqui embaixo o P2002 dele é
     * traduzido de volta para esta mesma frase.
     */
    const faturaExistente = await prisma.fatura.findFirst({
      where: { projetoId, status: { in: ['PENDENTE', 'PAGA'] } },
    })
    if (faturaExistente) throw new Error(FATURA_ATIVA_EXISTENTE)

    /*
     * O contrato do projeto — cláusula 7.1 e seguintes do anexo.
     *
     * Com `EXIGIR_CONTRATO_PROJETO` desligado (o padrão), isto não impede nada:
     * a pendência é calculada e viaja de volta em `avisoContrato`, e a tela
     * mostra. Ligar o bloqueio de uma vez, com os projetos existentes sem
     * contrato, deixaria todo mundo sem conseguir cobrar e sem ver o motivo —
     * mesmo raciocínio de `EXIGIR_EMAIL_VERIFICADO`.
     */
    const avisoContrato = await pendenciaDeContrato(projetoId)
    if (avisoContrato?.bloqueia) throw new ContratoPendenteError(avisoContrato.mensagem)

    const taxaPercentual = await taxaDoDesigner(projeto.designerId)
    const taxaValor = Math.round(projeto.orcamento * taxaPercentual)
    const valorLiquido = projeto.orcamento - taxaValor

    const fatura = await criarOuRecusarDuplicata({
      data: {
        projetoId,
        clienteId: projeto.clienteId,
        designerId: projeto.designerId,
        valor: projeto.orcamento,
        taxaPlataforma: taxaValor,
        valorLiquidoDesigner: valorLiquido,
        /*
         * Sem descrição inventada.
         *
         * O padrão era `Pagamento do projeto: ${projeto.nome}`, e a tela de
         * detalhe desenha o nome do projeto como título e a descrição logo
         * abaixo — então toda fatura sem descrição própria mostrava o nome do
         * projeto duas vezes seguidas. Nulo, a tela não desenha a linha; e a
         * descrição que vai ao gateway já tem o seu próprio fallback.
         */
        descricao: descricao ?? null,
        ...(dataVencimento ? { dataVencimento: new Date(dataVencimento) } : {}),
      },
      include: {
        projeto: { select: { id: true, nome: true } },
        cliente: { select: { id: true, nome: true, email: true } },
        designer: { select: { id: true, nome: true } },
      },
    })

    // Notify the client that a new invoice is ready
    notificacaoService.dispatch(
      projeto.clienteId,
      'FATURA_GERADA',
      `Fatura gerada — ${projeto.nome}`,
      `Uma fatura de ${formatCurrency(projeto.orcamento)} foi gerada para o projeto "${projeto.nome}". Acesse para realizar o pagamento.`,
      { entidadeTipo: 'FATURA', entidadeId: fatura.id },
    )

    /*
     * Pelo formatador, como as outras duas rotas da mesma entidade.
     * `listarFaturas` e `getFaturaById` já passavam por aqui; esta ficou de
     * fora e devolvia a linha crua do Prisma, então quem criava uma fatura
     * recebia `valorFormatado` e `valorLiquidoDesignerFormatado` indefinidos —
     * e a tela que mostrasse o resultado da criação ficaria em branco.
     */
    /*
     * `avisoContrato` sai junto da fatura, e não numa rota separada, porque é
     * sobre esta criação: a pessoa acabou de cobrar um projeto cujo contrato
     * ninguém aceitou, e é agora que ela precisa saber. Uma consulta à parte
     * seria outra requisição para dizer o que esta já sabe.
     */
    // Quem cria a fatura é o designer: a quebra entre taxa e líquido é dele.
    return { ...comValoresFormatados(fatura, true), avisoContrato }
  }

  async pagarFaturaComPix(faturaId: string, usuarioId: string, cpf: string) {
    const fatura = await prisma.fatura.findUnique({
      where: { id: faturaId },
      include: {
        cliente: { select: { nome: true, email: true } },
        projeto: { select: { nome: true } },
        /*
         * Todas as tentativas, da mais nova para a mais velha.
         *
         * Era uma só (`faturaId` era UNIQUE). Com uma tentativa morta na mão e
         * a fatura ainda PENDENTE, não havia caminho de volta.
         */
        pagamentos: { orderBy: { criadoEm: 'desc' } },
      },
    })
    if (!fatura) throw new Error('Fatura não encontrada')
    if (fatura.clienteId !== usuarioId) throw new Error('Acesso negado')
    if (fatura.status !== 'PENDENTE') throw new Error('Fatura não está pendente')

    const aprovado = fatura.pagamentos.find((p) => p.status === 'APROVADO')
    if (aprovado) {
      // A fatura deveria estar PAGA. Gerar outro QR aqui é convidar a pagar
      // duas vezes.
      throw new Error('Esta fatura já foi paga e está aguardando a confirmação')
    }

    /*
     * A tentativa que ainda está de pé.
     *
     * "De pé" é mais do que `status === 'PENDENTE'`: um QR cujo prazo passou
     * continua PENDENTE no banco até o webhook do gateway chegar, e reexpô-lo
     * é entregar ao cliente um código que o banco dele vai recusar.
     */
    const agora = new Date()
    const emAndamento = fatura.pagamentos.find(
      (p) =>
        p.status === 'PROCESSANDO' ||
        (p.status === 'PENDENTE' && (!p.expiraEm || p.expiraEm > agora)),
    )

    if (emAndamento) {
      if (emAndamento.status === 'PROCESSANDO') {
        throw new Error('Esta fatura já possui um pagamento em andamento')
      }
      // Reexpõe o QR existente em vez de criar outro — e com o prazo que ele
      // realmente tem, não com um recalculado a partir de agora.
      return {
        pagamentoId: emAndamento.id,
        qrCode: emAndamento.mpQrCode,
        qrCodeText: emAndamento.mpQrCodeText,
        expiraEm: emAndamento.expiraEm?.toISOString() ?? null,
      }
    }

    const expiraEm = new Date(agora.getTime() + env.PIX_EXPIRACAO_HORAS * 60 * 60 * 1000)

    /*
     * A chave de idempotência é da TENTATIVA, não da fatura.
     *
     * Era `fatura-${faturaId}`, fixa. Mesmo destravando o código acima, o
     * gateway devolveria o mesmo pagamento morto para sempre: a chave dizia
     * "esta fatura", quando o que precisa ser idempotente é "esta tentativa".
     * Repetir a MESMA tentativa (um retry de rede) continua colapsando numa
     * cobrança só, que é o ponto da idempotência.
     */
    const tentativa = fatura.pagamentos.length + 1

    const payment = await mpPayment.create({
      body: {
        transaction_amount: fatura.valor / 100,
        description: fatura.descricao ?? `Projeto: ${fatura.projeto.nome}`,
        payment_method_id: 'pix',
        payer: {
          email: fatura.cliente.email,
          first_name: fatura.cliente.nome.split(' ')[0],
          last_name: fatura.cliente.nome.split(' ').slice(1).join(' ') || ' ',
          identification: { type: 'CPF', number: cpf.replace(/\D/g, '') },
        },
        date_of_expiration: expiraEm.toISOString(),
      },
      requestOptions: { idempotencyKey: `fatura-${faturaId}-${tentativa}` },
    })

    /*
     * O prazo que vale é o que o gateway confirma. Só caímos no nosso quando
     * ele não devolve nada — e aí é o que mandamos, não um `agora + 24h`
     * recalculado depois.
     */
    const expiracaoDoGateway = (payment as any).date_of_expiration
    const expiraEmReal = expiracaoDoGateway ? new Date(expiracaoDoGateway) : expiraEm

    const pagamento = await prisma.pagamento.create({
      data: {
        tipo: 'FATURA',
        status: 'PENDENTE',
        valor: fatura.valor,
        metodoPagamento: 'PIX',
        mpPaymentId: String(payment.id),
        mpStatus: payment.status ?? null,
        mpQrCode: (payment as any).point_of_interaction?.transaction_data?.qr_code_base64 ?? null,
        mpQrCodeText: (payment as any).point_of_interaction?.transaction_data?.qr_code ?? null,
        expiraEm: expiraEmReal,
        usuarioId,
        faturaId,
      },
    })

    return {
      pagamentoId: pagamento.id,
      qrCode: pagamento.mpQrCode,
      qrCodeText: pagamento.mpQrCodeText,
      expiraEm: pagamento.expiraEm?.toISOString() ?? null,
    }
  }

  /*
   * `projetoId` estreita a lista a um projeto — e é filtro do banco, não da
   * tela. Quem abre uma disputa precisa escolher QUAL fatura está em jogo, e
   * filtrar no navegador uma lista que já chega inteira esconderia as faturas
   * que não couberam nela sem dizer que estava escondendo.
   *
   * O recorte por participante continua onde estava: mesmo com `projetoId`,
   * só saem faturas em que a pessoa é o cliente ou o designer.
   */
  async listarFaturas(usuarioId: string, tipo: 'cliente' | 'designer', projetoId?: string) {
    const where = {
      ...(tipo === 'cliente' ? { clienteId: usuarioId } : { designerId: usuarioId }),
      ...(projetoId ? { projetoId } : {}),
    }
    const faturas = await prisma.fatura.findMany({
      where,
      include: {
        projeto: { select: { id: true, nome: true } },
        cliente: { select: { id: true, nome: true } },
        designer: { select: { id: true, nome: true } },
        // A tentativa mais recente basta para a lista: é ela que diz se há um
        // pagamento em curso.
        pagamentos: {
          select: { id: true, status: true, metodoPagamento: true, expiraEm: true },
          orderBy: { criadoEm: 'desc' },
          take: 1,
        },
      },
      // `id` desempata: `criadoEm` sozinho não é ordem total, e faturas de um
      // mesmo lote nascem no mesmo instante.
      orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
    })

    // Quem lista como cliente está vendo o que paga; a quebra entre taxa e
    // líquido é do outro lado do balcão.
    return faturas.map((f) => comValoresFormatados(f, tipo === 'designer'))
  }

  async getFaturaById(id: string, requesterId: string, isAdmin: boolean) {
    const fatura = await prisma.fatura.findUnique({
      where: { id },
      include: {
        projeto: { select: { id: true, nome: true } },
        cliente: { select: { id: true, nome: true, email: true } },
        designer: { select: { id: true, nome: true } },
        pagamentos: { orderBy: { criadoEm: 'desc' } },
      },
    })
    if (!fatura) throw new Error('Fatura não encontrada')
    if (!isAdmin && fatura.clienteId !== requesterId && fatura.designerId !== requesterId) {
      throw new Error('Acesso negado')
    }
    // O designer e o admin veem a quebra; o cliente vê o que paga.
    return comValoresFormatados(fatura, isAdmin || fatura.designerId === requesterId)
  }

  async cancelarFatura(id: string, requesterId: string) {
    const fatura = await prisma.fatura.findUnique({ where: { id } })
    if (!fatura) throw new Error('Fatura não encontrada')

    // Autorização antes da máquina de estados. Na ordem inversa, a mensagem de
    // "transição inválida" respondia sobre o estado de uma fatura de outra
    // pessoa — um oráculo de status para quem só tem o id.
    const requester = await prisma.usuario.findUnique({ where: { id: requesterId } })
    if (fatura.designerId !== requesterId && requester?.tipo !== 'ADMIN') {
      throw new Error('Acesso negado')
    }

    assertValidTransition('Fatura', FATURA_TRANSITIONS, fatura.status, 'CANCELADA')

    return prisma.fatura.update({
      where: { id },
      data: { status: 'CANCELADA' },
    })
  }
}

const _svc = new FaturaService()
export const criarFatura = (...args: Parameters<FaturaService['criarFatura']>) => _svc.criarFatura(...args)
export const pagarFaturaComPix = (...args: Parameters<FaturaService['pagarFaturaComPix']>) => _svc.pagarFaturaComPix(...args)
export const listarFaturas = (...args: Parameters<FaturaService['listarFaturas']>) => _svc.listarFaturas(...args)
export const getFaturaById = (...args: Parameters<FaturaService['getFaturaById']>) => _svc.getFaturaById(...args)
export const cancelarFatura = (...args: Parameters<FaturaService['cancelarFatura']>) => _svc.cancelarFatura(...args)
