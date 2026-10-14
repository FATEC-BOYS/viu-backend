/**
 * ARAME. Nenhum controller decide o status HTTP lendo o texto de uma recusa de
 * transição.
 *
 * `assertValidTransition` lança `RecusaDeRegra` e `erroInterno` responde 409
 * para qualquer entidade. Mas isso só vale onde o `catch` chega ao funil, e
 * três endpoints não chegavam — todos reconhecendo a recusa pelo `includes` da
 * mensagem:
 *
 *   PUT /aprovacoes/:id          409 por `includes('é terminal')`
 *   PUT /admin/saques/:id/status 400 por `includes('Transição inválida')`
 *   PUT /disputas/:id/analisar   500 escrito à mão
 *
 * A mesma recusa, três códigos. E o pior: a frase é copy. O próprio
 * `aprovacaoController` tinha, duas linhas acima do `includes`, um comentário
 * contando que "renomear uma mensagem virar 500 em produção porque o status
 * dependia de um `includes`" já havia acontecido — e o `includes` estava ali.
 *
 * Um teste de integração por endpoint não cobre o que ainda não existe. Este
 * olha o código: se alguém voltar a decidir status pelo texto da transição, a
 * falha aparece aqui, com o caminho do arquivo.
 *
 * Reconhecer por TIPO (`ehRecusaDeRegra`) ou delegar para `erroInterno` não é
 * pego — são as duas formas certas.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const PASTAS = ['src/controllers', 'src/routes']

/*
 * Só dentro de `includes(...)`: o objetivo é o teste de decisão, não a palavra.
 * Comentário e mensagem de log podem citar a frase à vontade.
 */
const LENDO_O_TEXTO = /includes\(\s*['"`][^'"`]*(Transi[çc][ãa]o inv[áa]lida|terminal|Status desconhecido)/

function arquivosDe(pasta: string): string[] {
  return readdirSync(pasta)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => join(pasta, f))
}

describe('o status de uma recusa de transição', () => {
  it('não é decidido pelo texto da mensagem em nenhum controller ou rota', () => {
    const culpados: string[] = []

    for (const pasta of PASTAS) {
      for (const arquivo of arquivosDe(pasta)) {
        const linhas = readFileSync(arquivo, 'utf8').split('\n')
        linhas.forEach((linha, i) => {
          if (LENDO_O_TEXTO.test(linha)) culpados.push(`${arquivo}:${i + 1}`)
        })
      }
    }

    expect(
      culpados,
      `Status decidido pelo texto da recusa em:\n  ${culpados.join('\n  ')}\n\n` +
        'Use o tipo: deixe o erro subir para `erroInterno` (que responde 409 ' +
        'para `RecusaDeRegra`) ou teste com `ehRecusaDeRegra(erro)`. A frase ' +
        'da mensagem é copy e vai mudar.',
    ).toEqual([])
  })
})
