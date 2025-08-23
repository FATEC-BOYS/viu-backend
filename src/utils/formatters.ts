/**
 * Utilitários de formatação para o backend
 */

/**
 * Formatar valores monetários em centavos para string
 * @param centavos - Valor em centavos (número)
 * @returns String formatada em Real brasileiro
 */
export function formatCurrency(centavos: number): string {
  const reais = centavos / 100;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(reais);
}

/**
 * Formatar datas para string legível
 * @param date - Data em string ISO ou Date object
 * @returns String formatada em português brasileiro
 */
export function formatDate(date: string | Date): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  return new Intl.DateTimeFormat('pt-BR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(dateObj);
}