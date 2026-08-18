import prisma from '../database/client.js'

/**
 * Vínculo designer ↔ cliente.
 *
 * O laço é implícito — nasce do primeiro projeto em comum. Este serviço lida
 * apenas com a exceção: o designer romper o laço, tirando o cliente da própria
 * carteira. Nada do que já foi trocado é apagado, e a conta do cliente não é
 * alterada de forma alguma.
 */
export class VinculoService {
  /** Vínculos rompidos do designer — a UI usa para filtrar a carteira. */
  async listRompidos(designerId: string) {
    return prisma.vinculoCliente.findMany({
      where: { designerId, rompidoEm: { not: null } },
      include: {
        cliente: { select: { id: true, nome: true, email: true, avatar: true } },
      },
      orderBy: { rompidoEm: 'desc' },
    })
  }

  /**
   * Confirma que os dois já trabalharam juntos. Sem projeto em comum não há
   * laço para romper, e aceitar qualquer id permitiria sondar o banco de
   * usuários por tentativa e erro.
   */
  private async temProjetoEmComum(designerId: string, clienteId: string) {
    const projeto = await prisma.projeto.findFirst({
      where: { designerId, clienteId },
      select: { id: true },
    })
    return !!projeto
  }

  async romper(designerId: string, clienteId: string) {
    if (designerId === clienteId) throw new Error('Não é possível romper vínculo consigo mesmo')
    if (!(await this.temProjetoEmComum(designerId, clienteId))) {
      throw new Error('Vínculo não encontrado')
    }

    return prisma.vinculoCliente.upsert({
      where: { designerId_clienteId: { designerId, clienteId } },
      create: { designerId, clienteId, rompidoEm: new Date() },
      update: { rompidoEm: new Date() },
      include: { cliente: { select: { id: true, nome: true, email: true } } },
    })
  }

  async restaurar(designerId: string, clienteId: string) {
    const vinculo = await prisma.vinculoCliente.findUnique({
      where: { designerId_clienteId: { designerId, clienteId } },
    })
    if (!vinculo || !vinculo.rompidoEm) throw new Error('Vínculo não está rompido')

    return prisma.vinculoCliente.update({
      where: { designerId_clienteId: { designerId, clienteId } },
      data: { rompidoEm: null },
      include: { cliente: { select: { id: true, nome: true, email: true } } },
    })
  }
}

export const vinculoService = new VinculoService()
