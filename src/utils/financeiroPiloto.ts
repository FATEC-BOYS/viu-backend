import { env } from '../config/env.js'
export const TIPOS_FINANCEIROS = [
  'FATURA_GERADA', 'PAGAMENTO_CONFIRMADO', 'ESTORNO',
  'ASSINATURA_RENOVADA', 'ASSINATURA_CANCELADA', 'ASSINATURA_PAUSADA',
  'DISPUTA_ABERTA', 'DISPUTA_RESOLVIDA',
]
export function ocultarFinanceiro(tipo?: string): boolean {
  return env.FINANCEIRO_APENAS_ADMIN && tipo !== 'ADMIN'
}
