/**
 * Converte o prazo textual do JWT ("7d", "30m") na data de expiração.
 *
 * Mora aqui e não dentro de `usuarioService` porque a impersonação emite
 * sessão com prazo próprio e precisa da MESMA conta: duas cópias divergiriam no
 * dia em que alguém aceitasse uma unidade nova de um lado só, e o efeito seria
 * cookie vencendo em hora diferente do token no banco — 401 sem explicação.
 *
 * O padrão de 7 dias na entrada inválida é deliberado: prazo malformado no
 * ambiente não pode derrubar o login, e uma sessão que dura demais é problema
 * menor que nenhuma sessão.
 */
export function parseJwtExpiry(expiry: string): Date {
  const match = expiry.match(/^(\d+)([smhd])$/)
  if (!match || !match[1] || !match[2]) return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  const value = parseInt(match[1], 10)
  const unit = match[2] as 's' | 'm' | 'h' | 'd'
  const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 } as const
  return new Date(Date.now() + value * (multipliers[unit] ?? 86400000))
}
