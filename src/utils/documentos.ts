/**
 * CPF e CNPJ: os dois documentos que uma nota fiscal precisa conferir.
 *
 * `cpfValido` nasceu dentro de `schemas/validation.ts`, privado, para validar
 * chave PIX. Os dados fiscais precisam do mesmo conferidor e do irmão dele,
 * e copiar o algoritmo seria a forma mais fácil de ter duas verdades sobre o
 * que é um CPF válido — com a divergência aparecendo numa nota recusada pela
 * prefeitura, que é tarde.
 */

/** Só os dígitos: a pessoa digita com ponto, barra e traço. */
export function soDigitos(bruto: string): string {
  return (bruto ?? '').replace(/\D/g, '')
}

/**
 * Dígito verificador por soma ponderada, o mesmo esqueleto nos dois documentos.
 *
 * Difere só o peso: o CPF conta para baixo a partir do tamanho, o CNPJ cicla
 * de 9 a 2. Passar os pesos de fora deixa a aritmética num lugar só.
 */
function digitoVerificador(digitos: string, pesos: number[]): number {
  const soma = digitos
    .split('')
    // `?? 0` porque `noUncheckedIndexedAccess` não sabe que os pesos cobrem
    // exatamente o comprimento passado; um peso faltando viraria NaN, e NaN
    // reprovaria documento válido em silêncio.
    .reduce((acc, d, i) => acc + Number(d) * (pesos[i] ?? 0), 0)
  const resto = soma % 11
  return resto < 2 ? 0 : 11 - resto
}

export function cpfValido(bruto: string): boolean {
  const cpf = soDigitos(bruto)
  if (cpf.length !== 11) return false
  // Todos os dígitos iguais passam no cálculo, mas não existem como CPF.
  if (/^(\d)\1{10}$/.test(cpf)) return false

  const digito = (ate: number) => {
    let soma = 0
    for (let i = 0; i < ate; i++) soma += Number(cpf[i]) * (ate + 1 - i)
    const resto = (soma * 10) % 11
    return resto === 10 ? 0 : resto
  }
  return digito(9) === Number(cpf[9]) && digito(10) === Number(cpf[10])
}

const PESOS_CNPJ_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
const PESOS_CNPJ_2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]

export function cnpjValido(bruto: string): boolean {
  const cnpj = soDigitos(bruto)
  if (cnpj.length !== 14) return false
  // Mesma armadilha do CPF: 00000000000000 fecha a conta e não existe.
  if (/^(\d)\1{13}$/.test(cnpj)) return false

  const dv1 = digitoVerificador(cnpj.slice(0, 12), PESOS_CNPJ_1)
  if (dv1 !== Number(cnpj[12])) return false
  const dv2 = digitoVerificador(cnpj.slice(0, 13), PESOS_CNPJ_2)
  return dv2 === Number(cnpj[13])
}

/** CEP é oito dígitos. O hífen é enfeite de quem digita. */
export function cepValido(bruto: string): boolean {
  return soDigitos(bruto).length === 8
}

export const UNIDADES_FEDERATIVAS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const

export type UnidadeFederativa = (typeof UNIDADES_FEDERATIVAS)[number]

/**
 * O documento como se escreve, para a interface mostrar de volta o que a
 * pessoa reconhece. A gravação continua sendo só dígitos: formato é assunto
 * de quem exibe.
 */
export function formatarDocumento(bruto: string): string {
  const d = soDigitos(bruto)
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  return bruto
}

export function formatarCep(bruto: string): string {
  const d = soDigitos(bruto)
  return d.length === 8 ? d.replace(/(\d{5})(\d{3})/, '$1-$2') : bruto
}
