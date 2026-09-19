import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  return { default: criarPrismaMock() }
})

import prisma from '../../src/database/client.js'
import { AprovacaoService } from '../../src/services/aprovacaoService.js'
import { notificacaoService } from '../../src/services/notificacaoService.js'

const service = new AprovacaoService()
beforeEach(() => vi.clearAllMocks())

/*
 * O laço central do VIU: o designer manda, o cliente responde.
 *
 * O aviso da resposta existia só em `createAprovacao` — o caminho em que o
 * cliente registra uma decisão do zero. O produto decide por `PUT
 * /aprovacoes/:id` (`ViewerShell` diz isso em comentário), ou seja, por
 * `updateAprovacao`, que não avisava ninguém. Conferido no app antes do
 * conserto: pedir aprovação e aprovar deixava a caixa de entrada do designer
 * com as mesmas duas linhas do seed.
 */
describe('Decisão do cliente avisa o designer', () => {
  function aprovacaoPendente(extra: Record<string, unknown> = {}) {
    return {
      id: 'ap1',
      status: 'PENDENTE',
      comentario: null,
      aprovadorId: 'cliente1',
      arteId: 'arte1',
      arte: {
        id: 'arte1',
        nome: 'Logo TechStart',
        autorId: 'designer1',
        projeto: { clienteId: 'cliente1' },
      },
      ...extra,
    }
  }

  it('avisa o autor da arte quando o cliente aprova', async () => {
    vi.mocked(prisma.aprovacao.findUnique).mockResolvedValue(aprovacaoPendente() as any)
    vi.mocked(prisma.aprovacao.update).mockResolvedValue({ id: 'ap1' } as any)
    const dispatch = vi.spyOn(notificacaoService, 'dispatch').mockImplementation(() => {})

    await service.updateAprovacao('ap1', { status: 'APROVADO' }, 'cliente1')

    expect(dispatch).toHaveBeenCalledTimes(1)
    const [destinatario, tipo, titulo, , alvo] = dispatch.mock.calls[0]
    // O destinatário é quem mandou a arte, não o dono da conta: num time
    // podem ser pessoas diferentes, e quem espera resposta é quem enviou.
    expect(destinatario).toBe('designer1')
    expect(tipo).toBe('ARTE_APROVADA')
    expect(titulo).toContain('aprovada')
    // Sem alvo a notificação avisa e abandona — não há caminho até a arte.
    expect(alvo).toEqual({ entidadeTipo: 'ARTE', entidadeId: 'arte1' })
  })

  it('avisa com ARTE_REJEITADA e carrega o motivo quando o cliente recusa', async () => {
    vi.mocked(prisma.aprovacao.findUnique).mockResolvedValue(aprovacaoPendente() as any)
    vi.mocked(prisma.aprovacao.update).mockResolvedValue({ id: 'ap1' } as any)
    const dispatch = vi.spyOn(notificacaoService, 'dispatch').mockImplementation(() => {})

    await service.updateAprovacao(
      'ap1',
      { status: 'REJEITADO', comentario: 'O azul ficou escuro demais' },
      'cliente1',
    )

    const [, tipo, , conteudo] = dispatch.mock.calls[0]
    expect(tipo).toBe('ARTE_REJEITADA')
    // O motivo é o que o designer precisa para agir; avisar sem ele obriga a
    // abrir a arte para descobrir o que houve.
    expect(conteudo).toContain('O azul ficou escuro demais')
  })

  it('aproveita o motivo escrito antes da decisão', async () => {
    // `updateAprovacao` aceita decidir sem repetir o comentário já gravado.
    // Se o aviso lesse só o que veio agora, essa recusa chegaria sem motivo.
    vi.mocked(prisma.aprovacao.findUnique).mockResolvedValue(
      aprovacaoPendente({ comentario: 'Faltou o símbolo' }) as any,
    )
    vi.mocked(prisma.aprovacao.update).mockResolvedValue({ id: 'ap1' } as any)
    const dispatch = vi.spyOn(notificacaoService, 'dispatch').mockImplementation(() => {})

    await service.updateAprovacao('ap1', { status: 'REJEITADO' }, 'cliente1')

    const [, , , conteudo] = dispatch.mock.calls[0]
    expect(conteudo).toContain('Faltou o símbolo')
  })

  it('não avisa quando a atualização não é uma decisão', async () => {
    // Só editar o comentário não é responder. Avisar aqui ensinaria o designer
    // a ignorar o aviso que importa.
    vi.mocked(prisma.aprovacao.findUnique).mockResolvedValue(aprovacaoPendente() as any)
    vi.mocked(prisma.aprovacao.update).mockResolvedValue({ id: 'ap1' } as any)
    const dispatch = vi.spyOn(notificacaoService, 'dispatch').mockImplementation(() => {})

    await service.updateAprovacao('ap1', { comentario: 'anotação' }, 'cliente1')

    expect(dispatch).not.toHaveBeenCalled()
  })

  it('não avisa quando a decisão é recusada pela regra', async () => {
    // Recusa sem motivo não passa. O aviso não pode sair na frente do efeito:
    // o designer receberia "arte recusada" de uma recusa que não aconteceu.
    vi.mocked(prisma.aprovacao.findUnique).mockResolvedValue(aprovacaoPendente() as any)
    const dispatch = vi.spyOn(notificacaoService, 'dispatch').mockImplementation(() => {})

    await expect(
      service.updateAprovacao('ap1', { status: 'REJEITADO' }, 'cliente1'),
    ).rejects.toThrow()

    expect(dispatch).not.toHaveBeenCalled()
    expect(prisma.aprovacao.update).not.toHaveBeenCalled()
  })

  it('não avisa quem não é o aprovador — nem grava', async () => {
    vi.mocked(prisma.aprovacao.findUnique).mockResolvedValue(aprovacaoPendente() as any)
    const dispatch = vi.spyOn(notificacaoService, 'dispatch').mockImplementation(() => {})

    await expect(
      service.updateAprovacao('ap1', { status: 'APROVADO' }, 'estranho'),
    ).rejects.toThrow('Acesso negado')

    expect(dispatch).not.toHaveBeenCalled()
  })
})
