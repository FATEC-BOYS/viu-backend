import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FeedbackService } from '../../src/services/feedbackService.js'

vi.mock('../../src/database/client.js', async () => {
  const { criarPrismaMock } = await import('../helpers/prismaMock.js')
  return { default: criarPrismaMock() }
})

// O serviço usa utils/storage (R2). Sem este mock o teste
// tentava rede de verdade e morria com ENOTFOUND viu.r2.example.com.
vi.mock('../../src/utils/storage.js', () => ({
  uploadFile: vi.fn().mockResolvedValue(undefined),
  signPath: vi.fn().mockResolvedValue('https://storage.test/audio.webm'),
  signPaths: vi.fn().mockResolvedValue([]),
  deleteFile: vi.fn().mockResolvedValue(undefined),
  // Ler de volta do bucket. Devolve `null` por padrão — "não tenho cópia
  // guardada" — e cada teste que depende de ter diz isso explicitamente.
  lerArquivo: vi.fn().mockResolvedValue(null),
}))

vi.mock('../../src/services/transcricaoService.js', () => ({
  transcreverAudio: vi.fn().mockResolvedValue('texto transcrito do áudio'),
  sintetizarTexto: vi.fn().mockResolvedValue(Buffer.from([1, 2, 3])),
}))

import prisma from '../../src/database/client.js'
import { lerArquivo } from '../../src/utils/storage.js'
import { transcreverAudio, sintetizarTexto } from '../../src/services/transcricaoService.js'
import { notificacaoService } from '../../src/services/notificacaoService.js'

const service = new FeedbackService()
beforeEach(() => vi.clearAllMocks())

describe('FeedbackService', () => {
  it('listFeedbacks deve retornar feedbacks paginados', async () => {
    vi.mocked(prisma.feedback.findMany).mockResolvedValue([])
    vi.mocked(prisma.feedback.count).mockResolvedValue(0)
    const result = await service.listFeedbacks({})
    expect(result).toEqual({ feedbacks: [], total: 0 })
  })

  /*
   * A listagem precisa dizer quantas respostas cada thread tem.
   *
   * Ela devolve só as raízes (`parentId: null`), então sem esta contagem quem
   * desenha o cartão não tem como saber se alguém respondeu — e foi assim que
   * a tela de Feedbacks passou a carimbar "Aguardando resposta" em tudo que
   * não estivesse resolvido, inclusive nas conversas que ela mesma mostrava
   * respondidas no painel ao lado.
   *
   * O teste é de CONTRATO: a tela depende deste campo, e perdê-lo aqui volta
   * a quebrar a frase lá, em silêncio.
   */
  it('listFeedbacks pede a contagem de respostas, que o cartão usa', async () => {
    vi.mocked(prisma.feedback.findMany).mockResolvedValue([])
    vi.mocked(prisma.feedback.count).mockResolvedValue(0)

    await service.listFeedbacks({})

    const [args] = vi.mocked(prisma.feedback.findMany).mock.calls.at(-1) as [any]
    expect(args.include._count).toEqual({ select: { respostas: true } })
  })

  it('listFeedbacks devolve só as raízes — resposta não é item solto', async () => {
    // O par da contagem: se a resposta aparecesse como linha própria, ela
    // contaria duas vezes (uma na lista, outra dentro do pai).
    vi.mocked(prisma.feedback.findMany).mockResolvedValue([])
    vi.mocked(prisma.feedback.count).mockResolvedValue(0)

    await service.listFeedbacks({})

    const [args] = vi.mocked(prisma.feedback.findMany).mock.calls.at(-1) as [any]
    expect(args.where.AND).toContainEqual({ parentId: null })
  })

  it('createFeedback deve lançar erro se arte não existe', async () => {
    vi.mocked(prisma.arte.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue({ id: '1' } as any)
    await expect(service.createFeedback({ arteId: 'x', autorId: '1' }))
      .rejects.toThrow('Arte não encontrada')
  })

  it('createFeedback deve lançar erro se autor não existe', async () => {
    vi.mocked(prisma.arte.findUnique).mockResolvedValue({ id: '1' } as any)
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)
    await expect(service.createFeedback({ arteId: '1', autorId: 'x' }))
      .rejects.toThrow('Autor não encontrado')
  })

  it('updateFeedback deve lançar erro se não existe', async () => {
    vi.mocked(prisma.feedback.findUnique).mockResolvedValue(null)
    await expect(service.updateFeedback('x', {})).rejects.toThrow('Feedback não encontrado')
  })

  it('deleteFeedback deve lançar erro se não existe', async () => {
    vi.mocked(prisma.feedback.findUnique).mockResolvedValue(null)
    await expect(service.deleteFeedback('x')).rejects.toThrow('Feedback não encontrado')
  })
})

// A arte precisa carregar o projeto: createFeedbackComAudio agora confere se
// o autor participa dele. Os casos aqui são sobre transcrição e formato do
// registro — a negação cross-tenant é coberta em tests/security.
const ARTE_COM_PROJETO = (id: string, autorId: string) => ({
  id,
  projeto: { designerId: autorId, clienteId: 'cliente-1' },
})

describe('FeedbackService - createFeedbackComAudio', () => {
  it('deve lançar erro se arte não existe', async () => {
    vi.mocked(prisma.arte.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue({ id: '1' } as any)
    await expect(service.createFeedbackComAudio({
      arteId: 'x', autorId: '1', audioBuffer: Buffer.from('a'), filename: 'a.webm',
    })).rejects.toThrow('Arte não encontrada')
  })

  it('deve lançar erro se autor não existe', async () => {
    vi.mocked(prisma.arte.findUnique).mockResolvedValue({ id: '1' } as any)
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null)
    await expect(service.createFeedbackComAudio({
      arteId: '1', autorId: 'x', audioBuffer: Buffer.from('a'), filename: 'a.webm',
    })).rejects.toThrow('Autor não encontrado')
  })

  /*
   * Este teste existia afirmando `tipo: 'POSICIONAL'` para a gravação com
   * pino — ou seja, fixava o defeito no lugar.
   *
   * O rótulo `tipo` diz o MEIO do comentário; a posição já mora em
   * `posicaoX`/`posicaoY`, que são colunas independentes. Juntando as duas
   * coisas num campo, toda leitura que perguntava `tipo === 'AUDIO'`
   * respondia "não é áudio" para o áudio com pino — e eram quatro leituras,
   * incluindo o preview do link público. Medido lá: `arquivo_url: null` e
   * nenhum player desenhado.
   */
  it('áudio com pino é AUDIO com posição, e não um tipo à parte', async () => {
    vi.mocked(prisma.arte.findUnique).mockResolvedValue(ARTE_COM_PROJETO('art1', 'usr1') as any)
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue({ id: 'usr1', nome: 'Ana' } as any)
    vi.mocked(prisma.feedback.create).mockResolvedValue({ id: 'fb1', tipo: 'AUDIO' } as any)
    vi.mocked(prisma.feedback.update).mockResolvedValue({ id: 'fb1', tipo: 'AUDIO' } as any)

    const result = await service.createFeedbackComAudio({
      arteId: 'art1', autorId: 'usr1',
      audioBuffer: Buffer.from('audio'), filename: 'audio.webm',
      posicaoX: 150, posicaoY: 200,
    })

    expect(prisma.feedback.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        tipo: 'AUDIO',
        posicaoX: 150,
        posicaoY: 200,
        // guarda o caminho no bucket; a URL assinada é gerada na leitura
        arquivo: expect.stringMatching(/^feedbacks\/art1\/\d+_audio\.webm$/),
      }),
    }))
    expect(result.tipo).toBe('AUDIO')
  })

  it('deve criar feedback AUDIO se sem coordenadas', async () => {
    vi.mocked(prisma.arte.findUnique).mockResolvedValue(ARTE_COM_PROJETO('art1', 'usr1') as any)
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue({ id: 'usr1', nome: 'Ana' } as any)
    vi.mocked(prisma.feedback.create).mockResolvedValue({ id: 'fb1', tipo: 'AUDIO' } as any)
    vi.mocked(prisma.feedback.update).mockResolvedValue({ id: 'fb1', tipo: 'AUDIO' } as any)

    await service.createFeedbackComAudio({
      arteId: 'art1', autorId: 'usr1',
      audioBuffer: Buffer.from('audio'), filename: 'audio.webm',
    })

    expect(prisma.feedback.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tipo: 'AUDIO' }),
    }))
  })

  /*
   * A linha nasce ANTES de transcrever, e a transcrição entra por update.
   *
   * A ordem antiga era sobe-transcreve-cria, com a transcrição no caminho
   * crítico. O teste anterior conferia `conteudo` e `transcricao` já no
   * `create` — o que só é possível nessa ordem, e era justamente ela que
   * fazia um tropeço da OpenAI derrubar o comentário inteiro.
   */
  it('a gravação entra primeiro; o texto chega depois, por update', async () => {
    vi.mocked(prisma.arte.findUnique).mockResolvedValue(ARTE_COM_PROJETO('art1', 'usr1') as any)
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue({ id: 'usr1', nome: 'Ana' } as any)
    vi.mocked(prisma.feedback.create).mockResolvedValue({ id: 'fb1', tipo: 'AUDIO' } as any)
    vi.mocked(prisma.feedback.update).mockResolvedValue({
      id: 'fb1', tipo: 'AUDIO', transcricao: 'texto transcrito do áudio',
    } as any)

    const result = await service.createFeedbackComAudio({
      arteId: 'art1', autorId: 'usr1',
      audioBuffer: Buffer.from('audio'), filename: 'audio.webm',
    })

    // Nasce sem texto: vazio é a resposta honesta para "ainda não transcrevi".
    expect(prisma.feedback.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ conteudo: '' }),
    }))
    expect(transcreverAudio).toHaveBeenCalledWith(Buffer.from('audio'), 'audio.webm')
    expect(prisma.feedback.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'fb1' },
      data: { conteudo: 'texto transcrito do áudio', transcricao: 'texto transcrito do áudio' },
    }))
    expect(result.transcricao).toBe('texto transcrito do áudio')
  })

  /*
   * O caso que motivou o conserto, e o que a Alessandra escolheu: transcrição
   * falhando NÃO derruba o comentário.
   *
   * Sem chave da OpenAI, com cota estourada ou com o serviço fora, o cliente
   * gravava o recado e recebia "Não foi possível enviar o áudio" — e o
   * arquivo, que já tinha subido, ficava órfão no bucket. A gravação é o
   * comentário; o texto é conveniência.
   */
  it('transcrição falhando não derruba o comentário em áudio', async () => {
    vi.mocked(prisma.arte.findUnique).mockResolvedValue(ARTE_COM_PROJETO('art1', 'usr1') as any)
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue({ id: 'usr1', nome: 'Ana' } as any)
    vi.mocked(prisma.feedback.create).mockResolvedValue({ id: 'fb1', tipo: 'AUDIO' } as any)
    vi.mocked(transcreverAudio).mockRejectedValueOnce(
      new Error('OPENAI_API_KEY não configurada'),
    )
    const avisos = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await service.createFeedbackComAudio({
      arteId: 'art1', autorId: 'usr1',
      audioBuffer: Buffer.from('audio'), filename: 'audio.webm',
    })

    expect(result.id).toBe('fb1')
    expect(prisma.feedback.update).not.toHaveBeenCalled()
    expect(avisos).toHaveBeenCalled()
    avisos.mockRestore()
  })

  /*
   * O fluxo de texto avisava a outra parte; o de áudio não avisava ninguém.
   *
   * O cliente gravava o recado, ele entrava no banco, e o designer só ficava
   * sabendo se entrasse na arte e rolasse a lista. O recado em áudio é
   * justamente o que se manda com pressa de ser ouvido.
   */
  it('avisa a outra parte, como o fluxo de texto avisa', async () => {
    vi.mocked(prisma.arte.findUnique).mockResolvedValue(
      { ...(ARTE_COM_PROJETO('art1', 'designer-1') as any), nome: 'Capa' } as any,
    )
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue({ id: 'cliente-1', nome: 'João' } as any)
    vi.mocked(prisma.feedback.create).mockResolvedValue({ id: 'fb1', tipo: 'AUDIO' } as any)
    vi.mocked(prisma.feedback.update).mockResolvedValue({ id: 'fb1', tipo: 'AUDIO' } as any)
    const dispatch = vi.spyOn(notificacaoService, 'dispatch').mockImplementation(() => {})

    // O cliente comenta: quem precisa saber é o designer.
    await service.createFeedbackComAudio({
      arteId: 'art1', autorId: 'cliente-1',
      audioBuffer: Buffer.from('audio'), filename: 'audio.webm',
      origem: { via: 'link' },
    })

    expect(dispatch).toHaveBeenCalledWith(
      'designer-1',
      'NOVO_FEEDBACK',
      expect.stringContaining('Capa'),
      expect.stringContaining('áudio'),
      { entidadeTipo: 'ARTE', entidadeId: 'art1' },
    )
    dispatch.mockRestore()
  })
})

describe('FeedbackService - gerarAudioDoFeedback', () => {
  it('deve lançar erro se feedback não existe', async () => {
    vi.mocked(prisma.feedback.findUnique).mockResolvedValue(null)
    await expect(service.gerarAudioDoFeedback('x')).rejects.toThrow('Feedback não encontrado')
  })

  it('deve lançar erro se conteúdo vazio', async () => {
    vi.mocked(prisma.feedback.findUnique).mockResolvedValue({
      id: '1', conteudo: '', audioGerado: null,
    } as any)
    await expect(service.gerarAudioDoFeedback('1'))
      .rejects.toThrow('não possui conteúdo textual')
  })

  it('deve gerar áudio TTS e retornar buffer', async () => {
    vi.mocked(prisma.feedback.findUnique).mockResolvedValue({
      id: '1', conteudo: 'Olá mundo', audioGerado: null,
    } as any)
    vi.mocked(prisma.feedback.update).mockResolvedValue({} as any)

    const result = await service.gerarAudioDoFeedback('1')
    expect(sintetizarTexto).toHaveBeenCalledWith('Olá mundo')
    expect(Buffer.isBuffer(result.buffer)).toBe(true)
  })

  /*
   * O cache de síntese, que nunca acertou uma vez.
   *
   * `audioGerado` guarda a CHAVE do bucket, e o código fazia
   * `fetch(feedback.audioGerado)` — sem endereço para onde ir, lançava, caía
   * no catch e sintetizava de novo. Cada clique em "ouvir" era uma cobrança
   * nova na conta da OpenAI pelo mesmo comentário, e a coluna existia sem
   * servir para nada.
   */
  it('com cópia no bucket, não sintetiza de novo', async () => {
    vi.mocked(prisma.feedback.findUnique).mockResolvedValue({
      id: '1', conteudo: 'Olá mundo', audioGerado: 'feedbacks-tts/1/123.mp3',
    } as any)
    vi.mocked(lerArquivo).mockResolvedValueOnce(Buffer.from('mp3 guardado'))

    const result = await service.gerarAudioDoFeedback('1')

    expect(lerArquivo).toHaveBeenCalledWith('feedbacks-tts/1/123.mp3')
    expect(sintetizarTexto).not.toHaveBeenCalled()
    expect(result.buffer.toString()).toBe('mp3 guardado')
  })

  it('sem cópia no bucket, sintetiza e guarda para a próxima', async () => {
    vi.mocked(prisma.feedback.findUnique).mockResolvedValue({
      id: '1', conteudo: 'Olá mundo', audioGerado: 'feedbacks-tts/1/123.mp3',
    } as any)
    // A chave está na coluna mas o objeto não está mais lá.
    vi.mocked(lerArquivo).mockResolvedValueOnce(null)
    vi.mocked(prisma.feedback.update).mockResolvedValue({} as any)

    await service.gerarAudioDoFeedback('1')

    expect(sintetizarTexto).toHaveBeenCalledWith('Olá mundo')
    expect(prisma.feedback.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: '1' },
      data: { audioGerado: expect.stringMatching(/^feedbacks-tts\/1\/\d+\.mp3$/) },
    }))
  })
})

describe('FeedbackService - getTranscricao', () => {
  it('deve lançar erro se feedback não existe', async () => {
    vi.mocked(prisma.feedback.findUnique).mockResolvedValue(null)
    await expect(service.getTranscricao('x')).rejects.toThrow('Feedback não encontrado')
  })

  it('deve retornar transcrição em cache', async () => {
    vi.mocked(prisma.feedback.findUnique).mockResolvedValue({
      id: '1', transcricao: 'já transcrito', arquivo: 'url',
    } as any)
    const result = await service.getTranscricao('1')
    expect(result).toBe('já transcrito')
    expect(transcreverAudio).not.toHaveBeenCalled()
  })

  it('deve lançar erro se sem áudio e sem transcrição', async () => {
    vi.mocked(prisma.feedback.findUnique).mockResolvedValue({
      id: '1', transcricao: null, arquivo: null,
    } as any)
    await expect(service.getTranscricao('1'))
      .rejects.toThrow('não possui áudio para transcrever')
  })

  /*
   * Transcrever DEPOIS um áudio que entrou sem texto.
   *
   * Este caminho é o que passa a importar agora que a transcrição deixou de
   * ser condição para o comentário existir — e ele nunca funcionou: fazia
   * `fetch(feedback.arquivo)` numa chave de bucket. Lê do R2 pela chave, como
   * o resto do serviço.
   */
  it('lê o áudio do bucket pela chave e transcreve, guardando o resultado', async () => {
    vi.mocked(prisma.feedback.findUnique).mockResolvedValue({
      id: '1', transcricao: null, arquivo: 'feedbacks/art1/123_gravacao.webm',
    } as any)
    vi.mocked(lerArquivo).mockResolvedValueOnce(Buffer.from('bytes do webm'))
    vi.mocked(prisma.feedback.update).mockResolvedValue({} as any)

    const result = await service.getTranscricao('1')

    expect(lerArquivo).toHaveBeenCalledWith('feedbacks/art1/123_gravacao.webm')
    expect(transcreverAudio).toHaveBeenCalledWith(Buffer.from('bytes do webm'))
    expect(result).toBe('texto transcrito do áudio')
    expect(prisma.feedback.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: '1' },
      data: { transcricao: 'texto transcrito do áudio' },
    }))
  })

  it('o arquivo não estar no bucket é erro, e não transcrição vazia', async () => {
    vi.mocked(prisma.feedback.findUnique).mockResolvedValue({
      id: '1', transcricao: null, arquivo: 'feedbacks/art1/sumiu.webm',
    } as any)
    vi.mocked(lerArquivo).mockResolvedValueOnce(null)

    await expect(service.getTranscricao('1')).rejects.toThrow('Erro ao buscar arquivo de áudio')
    expect(transcreverAudio).not.toHaveBeenCalled()
  })
})
