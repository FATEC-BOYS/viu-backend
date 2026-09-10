import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

/**
 * Nenhuma resposta 500 pode sair sem registrar a causa.
 *
 * O padrão da casa era `catch { reply.status(500).send({ message: '...' }) }`.
 * Quando algo quebrava em produção o log tinha só `{"res":{"statusCode":500}}`
 * e o motivo morria no catch — duas investigações desta base começaram assim,
 * adivinhando, uma no login e outra no upload de arte.
 *
 * Um teste que lê o código-fonte é estranho, e é de propósito: o problema não
 * é um comportamento errado, é um esquecimento fácil que só cobra o preço no
 * pior momento. Aqui ele aparece no primeiro `npm test`, não em produção.
 */
function arquivosTs(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) return arquivosTs(caminho)
    return caminho.endsWith('.ts') ? [caminho] : []
  })
}

/** Corpo de cada `catch`, delimitado por contagem de chaves. */
function corposDeCatch(src: string): string[] {
  const corpos: string[] = []
  const catchs = /\bcatch\s*(\([^)]*\))?\s*\{/g
  let m: RegExpExecArray | null
  while ((m = catchs.exec(src))) {
    let i = m.index + m[0].length
    let profundidade = 1
    while (i < src.length && profundidade > 0) {
      if (src[i] === '{') profundidade++
      else if (src[i] === '}') profundidade--
      i++
    }
    corpos.push(src.slice(m.index + m[0].length, i - 1))
  }
  return corpos
}

describe('respostas 500', () => {
  it('todas registram a causa antes de responder', () => {
    const mudos: string[] = []

    for (const arquivo of arquivosTs('src')) {
      // O próprio utilitário é quem faz o registro; a citação do padrão
      // antigo no comentário dele não conta.
      if (arquivo.endsWith('erroInterno.ts')) continue

      const src = readFileSync(arquivo, 'utf8')
      if (!src.includes('status(500)')) continue

      for (const corpo of corposDeCatch(src)) {
        if (!corpo.includes('status(500)')) continue
        if (corpo.includes('log.error') || corpo.includes('erroInterno(')) continue
        mudos.push(arquivo)
      }
    }

    expect(mudos, `use erroInterno(request, reply, erro, mensagem) em: ${mudos.join(', ')}`)
      .toEqual([])
  })
})
