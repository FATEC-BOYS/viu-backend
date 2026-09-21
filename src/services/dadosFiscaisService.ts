import prisma from '../database/client.js'
import { formatarCep, formatarDocumento } from '../utils/documentos.js'

/**
 * Os dados fiscais de uma conta.
 *
 * O VIU ainda não emite nota — os termos dizem isso com todas as letras
 * (cláusula 4.2). Mas emitir depende de ter estes campos, e não havia nenhum
 * deles em lugar nenhum do sistema. É o terreno, não a casa.
 *
 * Vale para os dois lados do balcão: o VIU emitindo para o designer
 * (assinatura e taxa retida) e o designer emitindo para o cliente. Mesmo
 * conjunto de campos, mesma tabela.
 */

/**
 * Formatado como se escreve, do jeito que as outras entidades já fazem.
 *
 * O banco guarda só dígitos — é a forma que o emissor recebe e a que se
 * procura. A pontuação nasce aqui, num lugar só, pelo motivo de sempre: se
 * cada tela formatasse por conta própria, duas telas mostrariam o mesmo CNPJ
 * de dois jeitos.
 */
function comCamposFormatados<T extends { documento: string; cep: string }>(d: T) {
  return {
    ...d,
    documentoFormatado: formatarDocumento(d.documento),
    cepFormatado: formatarCep(d.cep),
  }
}

export type DadosFiscaisEntrada = {
  tipoPessoa: string
  documento: string
  razaoSocial: string
  nomeFantasia?: string | null
  inscricaoMunicipal?: string | null
  cep: string
  logradouro: string
  numero: string
  complemento?: string | null
  bairro: string
  cidade: string
  uf: string
}

export class DadosFiscaisService {
  async getDadosFiscais(usuarioId: string) {
    const dados = await prisma.dadosFiscais.findUnique({ where: { usuarioId } })
    return dados ? comCamposFormatados(dados) : null
  }

  /**
   * Cria ou substitui — não há "editar um campo".
   *
   * Dado fiscal é um conjunto que só faz sentido inteiro: endereço pela metade
   * não emite nota. Um `PATCH` parcial deixaria a conta num estado que parece
   * preenchido e não serve, e o descobrimento seria na hora de emitir.
   */
  async salvarDadosFiscais(usuarioId: string, entrada: DadosFiscaisEntrada) {
    const dados = {
      ...entrada,
      nomeFantasia: entrada.nomeFantasia ?? null,
      inscricaoMunicipal: entrada.inscricaoMunicipal ?? null,
      complemento: entrada.complemento ?? null,
    }
    const salvo = await prisma.dadosFiscais.upsert({
      where: { usuarioId },
      create: { ...dados, usuarioId },
      update: dados,
    })
    return comCamposFormatados(salvo)
  }

  async removerDadosFiscais(usuarioId: string) {
    // `deleteMany` e não `delete`: apagar o que não existe não é erro, é o
    // estado que a pessoa pediu.
    await prisma.dadosFiscais.deleteMany({ where: { usuarioId } })
  }
}

const _svc = new DadosFiscaisService()
export const getDadosFiscais = (...a: Parameters<DadosFiscaisService['getDadosFiscais']>) =>
  _svc.getDadosFiscais(...a)
export const salvarDadosFiscais = (...a: Parameters<DadosFiscaisService['salvarDadosFiscais']>) =>
  _svc.salvarDadosFiscais(...a)
export const removerDadosFiscais = (...a: Parameters<DadosFiscaisService['removerDadosFiscais']>) =>
  _svc.removerDadosFiscais(...a)
