import { describe, it, expect } from 'vitest'
import pino from 'pino'
import { Writable } from 'stream'
import { erroInterno } from '../../src/utils/erroInterno.js'

/**
 * A causa precisa chegar ao log de verdade.
 *
 * `message` e `stack` de um `Error` não são enumeráveis, e o Pino só aplica o
 * serializador de erro na chave `err`. Sob a chave `erro` — que era a
 * convenção desta base — o log saía `"erro":{}`: existia a linha, mas a causa
 * se perdia igual a quando não havia log nenhum.
 *
 * Por isso este teste passa por um logger Pino de verdade em vez de espionar a
 * chamada: espião confirmaria que `log.error` foi chamado, que era justamente
 * o que já acontecia enquanto o log não servia para nada.
 */
function capturar() {
  const linhas: string[] = []
  const destino = new Writable({
    write(chunk, _enc, cb) { linhas.push(String(chunk)); cb() },
  })
  return { linhas, log: pino({ level: 'error' }, destino) }
}

function replyFalso() {
  const reply: any = {
    statusCode: 0,
    corpo: null,
    status(c: number) { reply.statusCode = c; return reply },
    send(d: any) { reply.corpo = d; return reply },
  }
  return reply
}

describe('erroInterno', () => {
  it('registra a mensagem e o stack do erro', () => {
    const { linhas, log } = capturar()
    const reply = replyFalso()

    erroInterno({ log } as never, reply, new Error('Projeto não possui orçamento definido'), 'Erro ao criar fatura')

    const registro = JSON.parse(linhas[0])
    expect(registro.msg).toBe('Erro ao criar fatura')
    expect(registro.err.message).toBe('Projeto não possui orçamento definido')
    expect(registro.err.stack).toContain('Error')
  })

  it('responde 500 sem devolver o erro interno a quem chamou', () => {
    const { log } = capturar()
    const reply = replyFalso()

    erroInterno({ log } as never, reply, new Error('select * from usuarios falhou'), 'Erro ao criar fatura')

    expect(reply.statusCode).toBe(500)
    expect(reply.corpo).toEqual({ message: 'Erro ao criar fatura', success: false })
    expect(JSON.stringify(reply.corpo)).not.toContain('select')
  })
})
