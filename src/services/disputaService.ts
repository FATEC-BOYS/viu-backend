import prisma from '../database/client.js'

export type DisputaTipo = 'CALOTE' | 'ENTREGA_INCOMPLETA' | 'FRAUDE' | 'OUTRO'
export type DisputaStatus = 'ABERTA' | 'EM_ANALISE' | 'RESOLVIDA_DESIGNER' | 'RESOLVIDA_CLIENTE' | 'ESCALADA'

export interface AbrirDisputaInput {
  tipo: DisputaTipo
  descricao: string
  abertaPorId: string
  projetoId: string
  faturaId?: string
}

export interface ResolverDisputaInput {
  resolucao: string
  status: 'RESOLVIDA_DESIGNER' | 'RESOLVIDA_CLIENTE' | 'ESCALADA'
}

const TIPOS_VALIDOS: DisputaTipo[] = ['CALOTE', 'ENTREGA_INCOMPLETA', 'FRAUDE', 'OUTRO']
const STATUS_FINAIS: DisputaStatus[] = ['RESOLVIDA_DESIGNER', 'RESOLVIDA_CLIENTE', 'ESCALADA']

export class DisputaService {
  async abrirDisputa(data: AbrirDisputaInput) {
    if (!TIPOS_VALIDOS.includes(data.tipo)) {
      throw new Error(`Tipo de disputa inválido: ${data.tipo}`)
    }

    const projeto = await prisma.projeto.findUnique({ where: { id: data.projetoId } })
    if (!projeto) throw new Error('Projeto não encontrado')

    // Freeze the fatura's net designer value as saldoBloqueado
    let saldoBloqueado = 0
    if (data.faturaId) {
      const fatura = await prisma.fatura.findUnique({ where: { id: data.faturaId } })
      if (!fatura) throw new Error('Fatura não encontrada')
      if (fatura.projetoId !== data.projetoId) throw new Error('Fatura não pertence ao projeto')
      saldoBloqueado = fatura.valorLiquidoDesigner
    }

    return prisma.disputa.create({
      data: {
        tipo: data.tipo,
        descricao: data.descricao,
        abertaPorId: data.abertaPorId,
        projetoId: data.projetoId,
        faturaId: data.faturaId,
        saldoBloqueado,
        status: 'ABERTA',
      },
      include: {
        abertaPor: { select: { id: true, nome: true, email: true, tipo: true } },
        projeto: { select: { id: true, nome: true } },
        fatura: { select: { id: true, valor: true, status: true } },
      },
    })
  }

  async listarDisputas(filtros: { abertaPorId?: string; projetoId?: string; status?: string }) {
    return prisma.disputa.findMany({
      where: {
        ...(filtros.abertaPorId ? { abertaPorId: filtros.abertaPorId } : {}),
        ...(filtros.projetoId ? { projetoId: filtros.projetoId } : {}),
        ...(filtros.status ? { status: filtros.status } : {}),
      },
      include: {
        abertaPor: { select: { id: true, nome: true, email: true, tipo: true } },
        projeto: { select: { id: true, nome: true } },
        fatura: { select: { id: true, valor: true, status: true } },
      },
      orderBy: { criadoEm: 'desc' },
    })
  }

  async getDisputa(id: string) {
    return prisma.disputa.findUnique({
      where: { id },
      include: {
        abertaPor: { select: { id: true, nome: true, email: true, tipo: true } },
        projeto: { select: { id: true, nome: true, designerId: true, clienteId: true } },
        fatura: { select: { id: true, valor: true, status: true, valorLiquidoDesigner: true } },
      },
    })
  }

  async resolverDisputa(id: string, data: ResolverDisputaInput) {
    if (!STATUS_FINAIS.includes(data.status as DisputaStatus)) {
      throw new Error(`Status de resolução inválido: ${data.status}`)
    }

    const disputa = await prisma.disputa.findUnique({ where: { id } })
    if (!disputa) throw new Error('Disputa não encontrada')
    if (disputa.status !== 'ABERTA' && disputa.status !== 'EM_ANALISE') {
      throw new Error('Disputa já foi resolvida')
    }

    return prisma.disputa.update({
      where: { id },
      data: {
        status: data.status,
        resolucao: data.resolucao,
        resolvidaEm: new Date(),
        saldoBloqueado: 0, // libera o bloqueio ao resolver
      },
      include: {
        abertaPor: { select: { id: true, nome: true, email: true } },
        projeto: { select: { id: true, nome: true } },
      },
    })
  }

  async moverParaAnalise(id: string) {
    return prisma.disputa.update({
      where: { id },
      data: { status: 'EM_ANALISE' },
    })
  }
}
