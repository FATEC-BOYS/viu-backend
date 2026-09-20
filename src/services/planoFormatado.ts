import { formatCurrency } from '../utils/formatters.js'

/**
 * Um plano como a interface precisa dele.
 *
 * A formatação vivia dentro de `listPlanos`, e era a única rota que a fazia:
 * `getPlanoById`, `createPlano`, `updatePlano` e a assinatura devolviam a
 * linha crua do Prisma. O efeito estava à vista em /assinaturas — "Taxa da
 * plataforma" desenhada em branco, porque `taxaPlataformaFormatada` não vinha.
 *
 * É o terceiro lugar deste código a ter o mesmo defeito (faturas e saques
 * vieram antes) e a solução é a mesma: uma função só, usada por todas as rotas
 * que descrevem a entidade, para não voltarem a divergir.
 */
export function comPlanoFormatado<T extends {
  precoMensal: number
  precoAnual: number | null
  taxaPlataforma: number
}>(p: T) {
  return {
    ...p,
    precoMensalFormatado: formatCurrency(p.precoMensal),
    precoAnualFormatado: p.precoAnual ? formatCurrency(p.precoAnual) : null,
    /*
     * A taxa é fração (0.05), não centavos — por isso não passa por
     * `formatCurrency`. Quem lê quer a porcentagem: "5%".
     */
    taxaPlataformaFormatada: `${(p.taxaPlataforma * 100).toFixed(0)}%`,
  }
}
