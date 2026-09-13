/**
 * O anexo de revisão e propriedade intelectual, renderizado a partir dos dados
 * do projeto.
 *
 * Mora no repositório, e não no banco, porque é texto que rege dinheiro: passa
 * por code review como qualquer outro código, e a versão fica amarrada a um
 * commit. Trocar uma cláusula é um diff que alguém aprova, não um UPDATE.
 *
 * ⚠️ PENDENTE DE REVISÃO JURÍDICA. Este texto é rascunho. Nenhuma linha aqui
 * foi validada por advogado, e a bandeira `revisadoJuridicamente` no contrato
 * gerado sai `false` enquanto a versão do template for esta — é assim que o
 * aviso some sozinho quando a revisão chegar, sem depender de alguém lembrar
 * de apagar um texto.
 *
 * Decisões de escopo já tomadas e refletidas aqui:
 *  - cláusula 4.2 ficou na Opção A (sem aprovação tácita). A Opção B saiu do
 *    template: silêncio não aprova nada.
 *  - cláusula 7.6 (portfólio) fica como texto, sem automação nesta versão.
 *  - as lacunas de 3.1, 4.1 e 7.2 viraram campos e entram preenchidas.
 */

import { formatCurrency } from '../utils/formatters.js'

/**
 * A versão do texto, e não da máquina que o produz.
 *
 * Sobe a cada mudança de redação, porque é este identificador que fica gravado
 * em `ContratoProjeto.templateVersao` e responde "o que exatamente a pessoa
 * aceitou". Dois textos diferentes sob o mesmo identificador destroem
 * justamente isso.
 *
 * @2 — cláusula 3.1 passou a dizer que as rodadas são POR ENTREGA (por peça
 *      registrada no VIU), e não pelo Projeto inteiro. A @1 era ambígua nesse
 *      ponto, e a ambiguidade caía exatamente sobre o número que se discute
 *      numa disputa.
 */
export const TEMPLATE_VERSAO = 'anexo-revisao-pi@2'

/** O template ainda não passou por advogado. Vira `true` numa versão futura. */
export const TEMPLATE_REVISADO_JURIDICAMENTE = false

export interface ParteContrato {
  id: string
  nome: string
  email: string
}

export interface DadosAnexo {
  partes: { designer: ParteContrato; cliente: ParteContrato }
  projeto: {
    id: string
    nome: string
    descricao: string | null
    orcamentoCentavos: number | null
    prazo: string | null
  }
  termos: {
    rodadasIncluidas: number | null
    prazoRevisaoDiasUteis: number | null
    licencaFinalidade: string | null
    licencaTerritorio: string | null
    licencaPrazo: string | null
    licencaPrazoAte: string | null
    exclusividade: boolean | null
    exclusividadeAte: string | null
    arquivosFonte: string | null
  }
  geradoEm: string
}

/*
 * Pelo formatador do sistema, não por um `toLocaleString` próprio. O valor no
 * contrato tem de ser idêntico ao que a fatura e a tela mostram — dois
 * formatadores divergem no dia em que um deles mudar, e aqui a divergência
 * apareceria num documento que rege pagamento.
 */
function moeda(centavos: number | null): string {
  if (centavos === null) return '—'
  return formatCurrency(centavos)
}

function data(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' })
}

const ARQUIVOS_FONTE_TEXTO: Record<string, string> = {
  NAO_INCLUSOS: 'não estão inclusos',
  INCLUSOS_APOS_QUITACAO: 'estão inclusos após a quitação integral',
  TAXA_EXTRA: 'podem ser adquiridos mediante taxa adicional, a combinar',
}

function prazoLicenca(termos: DadosAnexo['termos']): string {
  if (termos.licencaPrazo === 'ATE_DATA') return `até ${data(termos.licencaPrazoAte)}`
  if (termos.licencaPrazo === 'INDETERMINADO') return 'por prazo indeterminado'
  return '—'
}

function exclusividadeTexto(termos: DadosAnexo['termos']): string {
  if (termos.exclusividade === true) return `sim, até ${data(termos.exclusividadeAte)}`
  if (termos.exclusividade === false) return 'não'
  return '—'
}

/**
 * Produz o texto do anexo.
 *
 * Texto puro, e não markdown, por um motivo de prova e não de estilo: este
 * retorno vira `ContratoProjeto.texto` e o sha256 dele vira o `hash`. Se fosse
 * markdown, as partes concordariam com o documento renderizado enquanto o hash
 * cobriria o código-fonte dele — duas coisas diferentes, e a diferença
 * apareceria justamente quando alguém contestasse o que assinou. Em texto puro,
 * o que está no hash é exatamente o que esteve na tela.
 *
 * Determinístico pelo mesmo motivo: a mesma entrada tem de produzir os mesmos
 * bytes, hoje e daqui a um ano. Nada de `new Date()` aqui dentro; a data de
 * geração chega por `dados.geradoEm`.
 */
export function renderizarAnexo(dados: DadosAnexo): string {
  const { partes, projeto, termos } = dados

  return `ANEXO — REVISÃO DE ENTREGAS E PROPRIEDADE INTELECTUAL

[RASCUNHO PENDENTE DE REVISÃO JURÍDICA — este documento ainda não foi validado
por advogado. Valide antes de tratá-lo como definitivo.]

Plataforma de registro: VIU, somente meio técnico de envio, comentário e
registro de status. O VIU não é parte deste acordo e não adquire direitos sobre
as peças.

Projeto: ${projeto.nome}
Designer: ${partes.designer.nome} (${partes.designer.email})
Cliente: ${partes.cliente.nome} (${partes.cliente.email})
Valor acordado: ${moeda(projeto.orcamentoCentavos)}
Prazo do projeto: ${data(projeto.prazo)}
Gerado em: ${data(dados.geradoEm)}

Este anexo integra a proposta ou contrato de prestação de serviços firmado
entre as Partes. Em conflito sobre preço, prazo global ou escopo comercial,
prevalece o contrato principal. Em conflito sobre processo de revisão e efeitos
da aprovação de versão, prevalece este anexo.


1. OBJETO

1.1. Este anexo regula: (a) o processo de envio e revisão de versões; (b) o
significado de comentários e da aprovação registrados no VIU; (c) a
titularidade e a licença de uso das entregas do Projeto.

1.2. O registro na plataforma serve como evidência do que foi enviado,
comentado e aprovado.


2. VERSÕES E ENTREGAS

2.1. Cada arquivo ou conjunto enviado pelo Designer no VIU, identificado como
versão do Projeto, constitui uma versão de entrega para fins de revisão.

2.2. Comentários, marcações e áudios referem-se à versão em que foram feitos.
Pedidos feitos apenas por outros canais não substituem o registro no VIU, salvo
acordo escrito das Partes para aquela rodada.


3. RODADAS DE REVISÃO

3.1. Estão incluídas no valor acordado ${termos.rodadasIncluidas ?? '—'} rodadas de revisão POR
ENTREGA. Entende-se por entrega cada peça registrada individualmente no VIU
(cada arte), e não o Projeto como um todo: um Projeto com três peças tem o
número acima de rodadas para cada uma delas, e não somado entre elas.

3.2. Considera-se uma rodada o conjunto de feedbacks do Cliente sobre uma mesma
versão de uma entrega, consolidado até a próxima versão enviada pelo Designer.

3.3. Rodadas adicionais, mudança substancial de briefing ou pedidos fora do
escopo serão orçados à parte, por escrito, antes da execução.


4. PRAZO DE REVISÃO PELO CLIENTE

4.1. O Cliente terá ${termos.prazoRevisaoDiasUteis ?? '—'} dias úteis contados do aviso de disponibilidade
da versão no VIU para comentar, pedir ajustes ou aprovar.

4.2. Sem aprovação tácita. Decorrido o prazo sem manifestação, a versão não se
considera aprovada. O Designer poderá notificar o Cliente e suspender o
andamento da etapa até que haja feedback ou aprovação, sem prejuízo de prazos
totais realinhados de comum acordo.


5. SIGNIFICADO DA APROVAÇÃO NO VIU

5.1. Ao acionar "Aprovar" no VIU, o Cliente declara que aceita aquela versão
para a etapa do Projeto a que se destina.

5.2. A aprovação não implica, por si só: (a) transferência de direitos autorais
patrimoniais; (b) cessão de marca, nome empresarial ou direitos de imagem de
terceiros; (c) entrega de arquivos-fonte, salvo o previsto na cláusula 7;
(d) quitação de valores em aberto.


6. FEEDBACK

6.1. O Cliente compromete-se a feedback objetivo e acionável, preferencialmente
no VIU.

6.2. Feedback de várias pessoas do lado do Cliente deverá ser consolidado por
um interlocutor. Na ausência de consolidação, o Designer poderá solicitar
priorização antes de nova versão.


7. PROPRIEDADE INTELECTUAL E USO

7.1. Titularidade durante o Projeto. Os direitos autorais patrimoniais sobre as
criações originais do Designer permanecem do Designer até a quitação integral
dos valores devidos.

7.2. Após a quitação. Com o pagamento integral, o Designer concede ao Cliente
licença de uso nos seguintes limites:

    Peças cobertas: versões finais aprovadas da etapa quitada
    Finalidade e mídia: ${termos.licencaFinalidade ?? '—'}
    Território: ${termos.licencaTerritorio ?? '—'}
    Prazo: ${prazoLicenca(termos)}
    Exclusividade: ${exclusividadeTexto(termos)}
    Arquivos-fonte: ${ARQUIVOS_FONTE_TEXTO[termos.arquivosFonte ?? ''] ?? '—'}

7.3. Enquanto houver valores em atraso, o Cliente não adquire licença de uso
comercial amplo das peças, podendo o Designer exigir a retirada de circulação
de usos não autorizados, sem prejuízo da cobrança.

7.4. Materiais fornecidos pelo Cliente (logotipo, textos, fotos, fontes): o
Cliente declara possuir os direitos necessários e autoriza o uso somente para
execução e revisão do Projeto. A responsabilidade por reclamação de terceiros
sobre esses materiais é do Cliente.

7.5. Elementos de terceiros (banco de imagem, fontes comerciais): a
responsabilidade pela licença adequada ao uso final é da Parte indicada na
proposta. Uso além da licença contratada é de responsabilidade de quem o
promover.

7.6. Portfólio. O Designer poderá exibir a peça final e o nome do Cliente em
portfólio e propostas comerciais após a publicação pública pelo Cliente, salvo
acordo de confidencialidade em contrário. O Cliente pode opor-se por escrito em
projetos sob embargo.

7.7. Processo e estilo. Metodologia, know-how e estilo genérico do Designer não
são cedidos. O que se licencia é a peça concreta do Projeto, nos limites da
cláusula 7.2.


8. ALTERAÇÕES APÓS APROVAÇÃO

8.1. Pedidos de mudança sobre versão já aprovada constituem nova demanda, salvo
correção de erro objetivo atribuível ao Designer.


9. CONFIDENCIALIDADE

9.1. Havendo NDA próprio, ele prevalece. Na ausência, as Partes tratarão como
confidenciais as informações não públicas do Projeto, exceto prestadores
necessários, obrigações legais ou autorização da outra Parte.


10. LIMITAÇÕES

10.1. O VIU é ferramenta de registro. Indisponibilidade da plataforma não
transfere propriedade intelectual nem extingue obrigações de pagamento; prazos
de revisão e entrega serão prorrogados na medida do impedimento comprovado.

10.2. Este anexo não regula a relação do usuário com a operadora do VIU, que é
objeto dos Termos de Uso da plataforma.


11. ACEITE

11.1. Considera-se aceite deste anexo o registro eletrônico feito por cada
Parte no VIU, com data, endereço IP e a identificação da versão do texto
apresentada no momento do aceite.
`
}
