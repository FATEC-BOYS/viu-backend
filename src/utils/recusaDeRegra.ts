/**
 * "Não pode" não é "deu erro".
 *
 * Uma recusa de regra de negócio — projeto concluído que não volta atrás,
 * fatura paga que não pode ser cancelada, arte aprovada que não volta para
 * análise — é uma resposta CORRETA do servidor sobre o estado atual do
 * recurso. Ela saía como 500 porque `assertValidTransition` lançava `Error`
 * puro e o `catch` dos controllers manda tudo o que não reconhece para
 * `erroInterno`.
 *
 * Medido no app, arrastando um projeto concluído de volta para "Em andamento"
 * no Board: `PUT /projetos/:id` → **500**, e a tela mostrando "Não consegui
 * mover, desfazendo…" — a frase boa que o servidor tinha escrito
 * ("Projeto em status CONCLUIDO é terminal e não pode ser alterado") morria no
 * caminho, porque em produção o handler troca a mensagem de todo 5xx por
 * "Erro interno do servidor". Com razão: 5xx é falha nossa, e falha nossa não
 * se explica para o cliente.
 *
 * Então o conserto é dizer a verdade sobre o que aconteceu. 409 Conflict: o
 * pedido faz sentido, mas conflita com o estado em que o recurso está. E a
 * mensagem pode viajar, porque é vocabulário do produto, não entranha de
 * servidor.
 *
 * Quem lança: `assertValidTransition`. Quem traduz: `erroInterno`, que é o
 * funil por onde passa o `catch` de todos os controllers — por isso a correção
 * vale para projeto, arte, tarefa, fatura, pagamento, saque e disputa de uma
 * vez, sem tocar em nenhum deles.
 */
export class RecusaDeRegra extends Error {
  /** Lido por `erroInterno` e pelo handler global do Fastify. */
  readonly statusCode = 409

  constructor(message: string) {
    super(message)
    this.name = 'RecusaDeRegra'
  }
}

export function ehRecusaDeRegra(erro: unknown): erro is RecusaDeRegra {
  return erro instanceof RecusaDeRegra
}
