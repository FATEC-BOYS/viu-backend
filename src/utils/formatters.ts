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
/**
 * Data sem hora, para o que só tem dia.
 *
 * Um vencimento não acontece às 00:00 — ele é o dia 15. `formatDate` acrescenta
 * hora e minuto, e a fatura saía como "15 de setembro de 2026 às 00:00": uma
 * precisão que o dado não tem, ocupando a linha inteira. Mês abreviado porque
 * a data divide a linha com o nome do designer e o valor.
 */
export function formatDateOnly(date: string | Date): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;

  return new Intl.DateTimeFormat('pt-BR', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(dateObj);
}

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
/**
 * A data curta, para tabela.
 *
 * `formatDate` escreve "19 de setembro de 2026 às 00:00" — bom numa frase,
 * caro numa coluna: numa tabela de conferência ela come a largura das colunas
 * que importam, e a referência do documento sai da tela. Aqui a data é dado
 * de apoio, não texto.
 */
export function formatDateShort(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}
