import { vi } from 'vitest'

/**
 * Mock de notificacaoService que exporta a classe e a instância.
 *
 * Os testes mockavam só `notificacaoService`, mas arteController faz
 * `new NotificacaoService()` no topo do módulo — o import quebrava a suíte
 * inteira com "No NotificacaoService export is defined", antes de qualquer
 * teste rodar.
 */
const METODOS = [
  'dispatch', 'createNotificacao', 'listNotificacoes', 'getNotificacaoById',
  'markAsRead', 'markAllAsRead', 'deleteNotificacao',
] as const

export function criarNotificacaoMock() {
  const instancia = Object.fromEntries(METODOS.map((m) => [m, vi.fn()])) as Record<string, any>

  class NotificacaoService {
    constructor() {
      Object.assign(this, instancia)
    }
  }

  return { notificacaoService: instancia, NotificacaoService }
}
