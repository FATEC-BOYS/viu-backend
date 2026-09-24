import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  return { default: criarPrismaMock() }
})

import prisma from '../../src/database/client.js'
import { ConviteService } from '../../src/services/conviteService.js'
import { notificacaoService } from '../../src/services/notificacaoService.js'

const service = new ConviteService()

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.conviteProjeto.findUnique).mockResolvedValue({
    id: 'conv1',
    convidadoId: 'cliente1',
    projetoId: 'proj1',
    status: 'PENDENTE',
    projeto: { id: 'proj1', status: 'RASCUNHO' },
  } as never)
  vi.mocked(prisma.usuario.findUnique).mockResolvedValue({ nome: 'João Santos' } as never)
  // A transação devolve [convite, projeto] — o projeto é quem carrega o designer.
  vi.mocked(prisma.$transaction).mockResolvedValue([
    { id: 'conv1' },
    { id: 'proj1', nome: 'Rebranding', designerId: 'designer1' },
  ] as never)
})

/*
 * Conferido no app antes do conserto: recusar devolve 200, o projeto vira
 * CANCELADO, e convidar de novo responde "Convite só pode ser criado para
 * projetos em rascunho". Ou seja, um botão de uma palavra cancela o projeto de
 * outra pessoa de forma irreversível — e ninguém era avisado.
 */
describe('Recusar um convite cancela o projeto, e quem convidou fica sabendo', () => {
  it('avisa o designer, dizendo que o projeto foi cancelado', async () => {
    const dispatch = vi.spyOn(notificacaoService, 'dispatch').mockImplementation(() => {})

    await service.recusarConvitePorId('conv1', 'cliente1')

    expect(dispatch).toHaveBeenCalledTimes(1)
    const [destinatario, tipo, titulo, conteudo, alvo] = dispatch.mock.calls[0]
    // Quem perde o projeto é o designer, não quem recusou.
    expect(destinatario).toBe('designer1')
    expect(tipo).toBe('CONVITE_RECUSADO')
    expect(titulo).toContain('cancelado')
    expect(conteudo).toContain('João Santos')
    expect(conteudo).toContain('Rebranding')
    // A parte que muda o que a pessoa faz a seguir: não dá para reconvidar.
    expect(conteudo).toContain('criar um projeto novo')
    expect(alvo).toEqual({ entidadeTipo: 'PROJETO', entidadeId: 'proj1' })
  })

  it('cancela o projeto na mesma transação da recusa', async () => {
    vi.spyOn(notificacaoService, 'dispatch').mockImplementation(() => {})

    await service.recusarConvitePorId('conv1', 'cliente1')

    const operacoes = vi.mocked(prisma.$transaction).mock.calls[0][0] as any[]
    expect(operacoes).toHaveLength(2)
    // Convite respondido e projeto cancelado andam juntos: um sem o outro
    // deixaria um projeto em rascunho que ninguém mais pode aceitar.
    expect(prisma.conviteProjeto.update).toHaveBeenCalled()
    expect(prisma.projeto.update).toHaveBeenCalled()
  })

  it('recusa só quem foi convidado', async () => {
    await expect(service.recusarConvitePorId('conv1', 'outro')).rejects.toThrow(
      /não pertence a você/,
    )
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('não responde duas vezes ao mesmo convite', async () => {
    vi.mocked(prisma.conviteProjeto.findUnique).mockResolvedValue({
      id: 'conv1',
      convidadoId: 'cliente1',
      projetoId: 'proj1',
      status: 'RECUSADO',
      projeto: { id: 'proj1', status: 'CANCELADO' },
    } as never)

    await expect(service.recusarConvitePorId('conv1', 'cliente1')).rejects.toThrow(
      /já foi respondido/,
    )
  })
})
