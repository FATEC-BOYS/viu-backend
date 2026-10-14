/**
 * ARAME. Este teste existe para quebrar.
 *
 * `PROJETO_TRANSITIONS` é a fonte da regra, e o front tem um ESPELHO dela em
 * `viu-frontend/lib/transicoesDoProjeto.ts`. O espelho existe porque a API não
 * publica as transições em lugar nenhum (não há rota de enums nem campo na
 * resposta do projeto) e, sem conhecê-las, o Board do front oferecia
 * movimentos impossíveis: medido no app, arrastar para "Aguardando aceite" nem
 * virava requisição e sair de "Concluído" levava 500.
 *
 * Duas cópias da mesma verdade divergem — e a segunda não tem como saber que a
 * primeira mudou. Então o aviso mora aqui, do lado da fonte: mexer na tabela
 * faz este teste falhar, e a falha diz onde está o espelho.
 *
 * SE VOCÊ CHEGOU AQUI POR UMA FALHA: a mudança na máquina de estados
 * provavelmente está certa. Atualize `viu-frontend/lib/transicoesDoProjeto.ts`
 * com a mesma mudança e então ajuste o esperado abaixo. Não ajuste só o
 * esperado — é exatamente isso que o arame existe para impedir.
 *
 * O dia em que a API passar a devolver as transições do projeto junto com ele,
 * o espelho e este arquivo deixam de ser necessários.
 */
import { describe, it, expect } from 'vitest'
import { PROJETO_TRANSITIONS } from '../../src/utils/stateMachine.js'

const ESPELHO_NO_FRONT: Record<string, string[]> = {
  RASCUNHO: ['EM_ANDAMENTO', 'CANCELADO'],
  EM_ANDAMENTO: ['PAUSADO', 'CONCLUIDO', 'CANCELADO'],
  PAUSADO: ['EM_ANDAMENTO', 'CANCELADO'],
  CONCLUIDO: [],
  CANCELADO: [],
}

describe('o espelho do front', () => {
  it('bate com PROJETO_TRANSITIONS — se falhou, atualize viu-frontend/lib/transicoesDoProjeto.ts também', () => {
    expect(PROJETO_TRANSITIONS).toEqual(ESPELHO_NO_FRONT)
  })
})
