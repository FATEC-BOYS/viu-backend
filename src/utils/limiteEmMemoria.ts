/**
 * Janela deslizante de tentativas, em memória.
 *
 * Existe porque o @fastify/rate-limit guarda um balde por rota: quando duas
 * rotas precisam dividir o mesmo limite, ou quando a chave só é conhecida
 * depois do `authenticate` (o hook do plugin roda antes dele), não há como
 * expressar isso na configuração da rota.
 *
 * Memória, e não banco, porque isto conta *tentativas* numa janela curta —
 * perder o estado num restart custa pouco. Contagem que precisa sobreviver a
 * deploy (cadastros do dia, por exemplo) mora no Postgres.
 */
export interface JanelaDeslizante {
  /** Registra uma ocorrência e devolve quantas há na janela, incluindo esta. */
  registrar(chave: string, agora?: number): number
  /** Zera tudo — os testes precisam começar sem histórico. */
  limpar(): void
}

const MAX_CHAVES = 5000

export function criarJanelaDeslizante(janelaMs: number): JanelaDeslizante {
  const marcas = new Map<string, number[]>()

  return {
    registrar(chave: string, agora = Date.now()): number {
      const inicio = agora - janelaMs
      const atuais = (marcas.get(chave) ?? []).filter((t) => t > inicio)
      atuais.push(agora)
      marcas.set(chave, atuais)

      // Sem esta poda o Map cresce uma entrada por visitante e nunca encolhe.
      if (marcas.size > MAX_CHAVES) {
        for (const [outra, tempos] of marcas) {
          if (tempos.every((t) => t <= inicio)) marcas.delete(outra)
        }
      }

      return atuais.length
    },

    limpar() {
      marcas.clear()
    },
  }
}
