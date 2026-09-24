import { describe, it, expect } from 'vitest'
import {
  TipoUsuario, StatusProjeto, TipoArte, StatusArte,
  TipoFeedback, StatusAprovacao, StatusTarefa, Prioridade,
  TipoNotificacao, CanalNotificacao,
  TIPOS_USUARIO, STATUS_PROJETO, TIPOS_ARTE, STATUS_ARTE,
  TIPOS_FEEDBACK, STATUS_APROVACAO, STATUS_TAREFA, PRIORIDADES,
  TIPOS_NOTIFICACAO, CANAIS_NOTIFICACAO, ROTULO_NOTIFICACAO,
  isValidTipoUsuario, isValidStatusProjeto, isValidTipoArte,
  isValidStatusArte, isValidTipoFeedback, isValidStatusAprovacao,
  isValidStatusTarefa, isValidPrioridade, isValidTipoNotificacao,
  isValidCanalNotificacao,
} from '../../src/types/enums.js'
import { ARTE_TRANSITIONS, PROJETO_TRANSITIONS } from '../../src/utils/stateMachine.js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR_SERVICES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/services')

/**
 * Argumentos de cada `notificacaoService.dispatch(...)` de um arquivo.
 *
 * Feito na mão porque a alternativa é manter uma segunda lista de tipos — que
 * é exatamente a duplicata que deixou o enum divergir. Conta parênteses,
 * colchetes e chaves para não cortar no meio de um template literal ou de um
 * objeto, e ignora vírgula dentro de string.
 */
function argumentosDeDispatch(fonte: string): string[][] {
  const chamadas: string[][] = []
  const marca = 'notificacaoService.dispatch('

  for (let i = fonte.indexOf(marca); i !== -1; i = fonte.indexOf(marca, i + 1)) {
    let profundidade = 0
    let j = i + marca.length - 1
    let fim = -1
    for (; j < fonte.length; j++) {
      const c = fonte[j]
      if (c === '(') profundidade++
      else if (c === ')') {
        profundidade--
        if (profundidade === 0) { fim = j; break }
      }
    }
    if (fim === -1) continue

    const corpo = fonte.slice(i + marca.length, fim)
    const args: string[] = []
    let atual = ''
    let nivel = 0
    for (let k = 0; k < corpo.length; k++) {
      const c = corpo[k]
      if (c === '\'' || c === '"' || c === '`') {
        const aspas = c
        atual += c
        k++
        while (k < corpo.length && corpo[k] !== aspas) {
          if (corpo[k] === '\\') { atual += corpo[k]; k++ }
          atual += corpo[k]
          k++
        }
        atual += corpo[k] ?? ''
        continue
      }
      if (c === '(' || c === '[' || c === '{') nivel++
      else if (c === ')' || c === ']' || c === '}') nivel--
      if (c === ',' && nivel === 0) { args.push(atual.trim()); atual = ''; continue }
      atual += c
    }
    if (atual.trim()) args.push(atual.trim())
    if (args.length >= 2) chamadas.push(args)
  }
  return chamadas
}

describe('Enums - constantes', () => {
  it('TipoUsuario deve conter DESIGNER, CLIENTE e ADMIN', () => {
    expect(TipoUsuario.DESIGNER).toBe('DESIGNER')
    expect(TipoUsuario.CLIENTE).toBe('CLIENTE')
    expect(TipoUsuario.ADMIN).toBe('ADMIN')
  })

  /*
   * Conferido contra a máquina de estados, não contra uma lista escrita à mão.
   *
   * `RASCUNHO` faltava no enum e existia no sistema: `createProjeto` grava todo
   * projeto de não-admin nele, e o fluxo de convite depende disso. A lista
   * literal deste teste concordava com o enum errado — dois lugares repetindo a
   * mesma omissão não a denunciam.
   *
   * `PROJETO_TRANSITIONS` é quem decide quais estados existem: um estado que
   * não esteja lá não tem como ser alcançado nem deixado.
   */
  it('StatusProjeto declara exatamente os estados que a máquina conhece', () => {
    expect([...STATUS_PROJETO].sort()).toEqual(Object.keys(PROJETO_TRANSITIONS).sort())
  })

  it('inclui RASCUNHO, que é onde todo projeto de não-admin nasce', () => {
    expect(STATUS_PROJETO).toContain('RASCUNHO')
  })

  it('TipoArte deve conter todos os tipos', () => {
    expect(TIPOS_ARTE).toEqual(['IMAGEM', 'VIDEO', 'DOCUMENTO', 'AUDIO', 'OUTRO'])
  })

  it('StatusArte deve conter todos os status', () => {
    // `REVISAO` saiu: não era chave nem destino em `ARTE_TRANSITIONS`, então
    // arte que chegasse lá não saía mais — `assertValidTransition` respondia
    // "Status desconhecido para Arte" a qualquer mudança.
    expect(STATUS_ARTE).toEqual(['EM_ANALISE', 'APROVADO', 'REJEITADO'])
  })

  /*
   * O invariante que faltava, e cuja ausência deixou `REVISAO` existir por
   * tempo indeterminado: a lista de status e a máquina de estados descrevem a
   * mesma coisa, e um status que a máquina não conhece é uma arte travada —
   * `assertValidTransition` lê `transitions[from]`, acha `undefined` e recusa
   * tudo. Este teste é o que teria denunciado aquilo no dia em que apareceu.
   */
  it('todo status de arte é conhecido pela máquina de estados', () => {
    const conhecidos = Object.keys(ARTE_TRANSITIONS)
    expect([...STATUS_ARTE].sort()).toEqual(conhecidos.sort())
  })

  it('nenhum status de arte é um beco sem saída inesperado', () => {
    // APROVADO é terminal de propósito — arte aprovada não volta atrás. Os
    // demais precisam ter para onde ir, senão travam quem chegar neles.
    for (const status of STATUS_ARTE) {
      if (status === 'APROVADO') continue
      expect(ARTE_TRANSITIONS[status].length).toBeGreaterThan(0)
    }
  })

  it('TipoFeedback deve conter TEXTO, AUDIO e POSICIONAL', () => {
    expect(TIPOS_FEEDBACK).toEqual(['TEXTO', 'AUDIO', 'POSICIONAL'])
  })

  it('StatusAprovacao deve conter PENDENTE, APROVADO e REJEITADO', () => {
    expect(STATUS_APROVACAO).toEqual(['PENDENTE', 'APROVADO', 'REJEITADO'])
  })

  it('StatusTarefa deve conter todos os status', () => {
    expect(STATUS_TAREFA).toEqual(['PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA'])
  })

  it('Prioridade deve conter todos os níveis', () => {
    expect(PRIORIDADES).toEqual(['BAIXA', 'MEDIA', 'ALTA', 'URGENTE'])
  })

  /*
   * Este teste já existiu como `expect(TIPOS_NOTIFICACAO).toHaveLength(6)` e
   * passava verdinho enquanto o enum e o sistema falavam línguas diferentes:
   * contava seis, e eram seis — só que quatro deles nenhum serviço emitia, e
   * dez que os serviços emitiam não estavam na lista. Contagem não é conteúdo.
   *
   * Agora o teste vai ler os `dispatch` de verdade. Serviço que inventar um
   * tipo novo sem declará-lo aqui derruba a suíte, que é o único jeito de a
   * tela de /notificacoes não voltar a rotular pelo palpite.
   */
  it('TipoNotificacao declara exatamente os tipos que os serviços disparam', () => {
    const tiposDisparados = new Set<string>()

    for (const arquivo of fs.readdirSync(DIR_SERVICES)) {
      if (!arquivo.endsWith('.ts')) continue
      const fonte = fs.readFileSync(path.join(DIR_SERVICES, arquivo), 'utf8')
      for (const args of argumentosDeDispatch(fonte)) {
        /*
         * O 2º argumento é o tipo, e ele pode ser um ternário:
         * `status === 'APROVADO' ? 'ARTE_APROVADA' : 'ARTE_REJEITADA'`.
         * Só os ramos são tipos — a condição compara outra coisa (aqui, um
         * status de aprovação). Por isso o corte no `?`: pegar a expressão
         * inteira fazia o teste cobrar 'APROVADO' como tipo de notificação.
         */
        const corte = args[1].indexOf('?')
        const expressao = corte === -1 ? args[1] : args[1].slice(corte + 1)
        for (const [, literal] of expressao.matchAll(/'([A-Z_]+)'/g)) {
          tiposDisparados.add(literal)
        }
      }
    }

    // Se isto vier vazio o teste não está provando nada — provavelmente o
    // parser deixou de achar as chamadas.
    expect(tiposDisparados.size).toBeGreaterThan(0)

    const naoDeclarados = [...tiposDisparados].filter((t) => !TIPOS_NOTIFICACAO.includes(t as any))
    expect(naoDeclarados).toEqual([])

    // E cada tipo declarado precisa de rótulo: sem ele a caixa de entrada
    // mostra o próprio identificador, como mostrava `APROVACAO_SOLICITADA`.
    for (const tipo of TIPOS_NOTIFICACAO) {
      expect(ROTULO_NOTIFICACAO[tipo], `sem rótulo: ${tipo}`).toBeTruthy()
    }
  })

  it('CanalNotificacao deve conter todos os canais', () => {
    expect(CANAIS_NOTIFICACAO).toEqual(['SISTEMA', 'EMAIL', 'PUSH', 'SMS'])
  })
})

describe('Funções de validação', () => {
  it('isValidTipoUsuario retorna true para valores válidos', () => {
    expect(isValidTipoUsuario('DESIGNER')).toBe(true)
    expect(isValidTipoUsuario('CLIENTE')).toBe(true)
    expect(isValidTipoUsuario('ADMIN')).toBe(true)
  })

  it('isValidTipoUsuario retorna false para valores inválidos', () => {
    expect(isValidTipoUsuario('INVALIDO')).toBe(false)
    expect(isValidTipoUsuario('')).toBe(false)
  })

  it('isValidStatusProjeto funciona corretamente', () => {
    expect(isValidStatusProjeto('EM_ANDAMENTO')).toBe(true)
    expect(isValidStatusProjeto('INVALIDO')).toBe(false)
  })

  it('isValidTipoArte funciona corretamente', () => {
    expect(isValidTipoArte('IMAGEM')).toBe(true)
    expect(isValidTipoArte('INVALIDO')).toBe(false)
  })

  it('isValidStatusArte funciona corretamente', () => {
    expect(isValidStatusArte('EM_ANALISE')).toBe(true)
    expect(isValidStatusArte('INVALIDO')).toBe(false)
  })

  it('isValidTipoFeedback funciona corretamente', () => {
    expect(isValidTipoFeedback('TEXTO')).toBe(true)
    expect(isValidTipoFeedback('INVALIDO')).toBe(false)
  })

  it('isValidStatusAprovacao funciona corretamente', () => {
    expect(isValidStatusAprovacao('PENDENTE')).toBe(true)
    expect(isValidStatusAprovacao('INVALIDO')).toBe(false)
  })

  it('isValidStatusTarefa funciona corretamente', () => {
    expect(isValidStatusTarefa('PENDENTE')).toBe(true)
    expect(isValidStatusTarefa('INVALIDO')).toBe(false)
  })

  it('isValidPrioridade funciona corretamente', () => {
    expect(isValidPrioridade('ALTA')).toBe(true)
    expect(isValidPrioridade('INVALIDO')).toBe(false)
  })

  it('isValidTipoNotificacao funciona corretamente', () => {
    expect(isValidTipoNotificacao('APROVACAO_SOLICITADA')).toBe(true)
    expect(isValidTipoNotificacao('INVALIDO')).toBe(false)
  })

  it('isValidCanalNotificacao funciona corretamente', () => {
    expect(isValidCanalNotificacao('EMAIL')).toBe(true)
    expect(isValidCanalNotificacao('INVALIDO')).toBe(false)
  })
})
