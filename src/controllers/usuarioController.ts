import { FastifyRequest, FastifyReply } from 'fastify'
import { UsuarioService, ListUsuariosParams } from '../services/usuarioService.js'
import { registrarAceiteTermos } from '../services/termosPlataformaService.js'
import { assinarPlanoGratuito } from '../services/assinaturaService.js'
import {
  sendVerificationEmail,
  sendAvisoDeContaCriadaPorTerceiro,
} from '../services/emailVerificationService.js'
import { uploadFile } from '../utils/storage.js'
import { auditLogService } from '../services/auditLogService.js'
import { definirCookiesDeSessao } from '../utils/authCookies.js'
import { erroInterno } from '../utils/erroInterno.js'

const usuarioService = new UsuarioService()

export async function listUsuarios(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const { page = 1, limit = 10, tipo, ativo } = (request.query || {}) as any
    const params: ListUsuariosParams = {
      page: Number(page),
      limit: Number(limit),
      tipo: tipo as string | undefined,
      ativo: ativo as any,
    }
    const { usuarios, total } = await usuarioService.listUsuarios(params)
    reply.send({
      data: usuarios,
      pagination: { page: params.page, limit: params.limit, total, pages: Math.ceil(total / params.limit!) },
      success: true,
    })
  } catch (erro) {
    request.log.error({ err: erro }, 'Erro ao buscar usuários')
    reply.status(500).send({ message: 'Erro ao buscar usuários', success: false })
  }
}

export async function getUsuarioById(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const { id } = request.params as { id: string }
    const usuario = await usuarioService.getUsuarioById(id)
    if (!usuario) {
      reply.status(404).send({ message: 'Usuário não encontrado', success: false })
      return
    }
    reply.send({ data: usuario, success: true })
  } catch (erro) {
    request.log.error({ err: erro }, 'Erro ao buscar usuário')
    reply.status(500).send({ message: 'Erro ao buscar usuário', success: false })
  }
}

/**
 * Quem é o cliente deste projeto? Devolve o id — criando a conta só se não
 * houver nenhuma com aquele e-mail.
 */
export async function resolverClienteHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const usuarioQueChamou = (request as any).usuario
    const body = request.body as { email: string; nome: string; telefone?: string }
    const { usuario, jaExistia } = await usuarioService.resolverCliente(body)

    /*
     * Ninguém é cadastrado em silêncio.
     *
     * O envio vivia só no handler de `createUsuario`, e esta rota chama o
     * serviço direto — então a conta nascia sem que a pessoa recebesse nada.
     * Era pior que o e-mail errado: era e-mail nenhum.
     *
     * Só para conta NOVA: quem já tinha conta não precisa ser avisado de um
     * cadastro que não aconteceu. O que ela recebe é o convite do projeto,
     * quando houver.
     */
    if (!jaExistia) {
      sendAvisoDeContaCriadaPorTerceiro(usuario.id, usuario.email, {
        nome: usuarioQueChamou?.nome ?? 'Um designer',
        email: usuarioQueChamou?.email ?? '',
      }).catch((err) => request.log.error({ err }, 'Falha ao avisar cliente cadastrado por terceiro'))
    }

    reply.status(jaExistia ? 200 : 201).send({
      message: jaExistia
        ? 'Esta pessoa já tem conta no VIU.'
        : 'Cliente cadastrado com sucesso.',
      data: { ...usuario, jaExistia },
      success: true,
    })
  } catch (error: any) {
    if (error?.codigo === 'CONTA_INDISPONIVEL') {
      reply.status(409).send({ message: error.message, codigo: error.codigo, success: false })
      return
    }
    erroInterno(request, reply, error, 'Erro ao localizar o cliente')
  }
}

export async function createUsuario(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = await usuarioService.createUsuario(request.body)

    /*
     * O aceite dos termos da plataforma, gravado com o texto que estava no ar.
     *
     * Aqui e não na criação do projeto: os termos regem a relação com o VIU —
     * conta, ferramenta, dados —, então o momento é o cadastro. O que havia
     * antes gravava um aceite no `POST /projetos` apontando para um
     * `termoVersao: "1.0"` que não existia, no momento errado e sem ninguém
     * ler de volta.
     *
     * Não é fire-and-forget: sem o aceite gravado a conta nasce sem a prova, e
     * o cadastro público já foi recusado antes daqui se a pessoa não marcou.
     * Perder a linha em silêncio devolveria o mesmo buraco por outro caminho.
     */
    const { aceiteTermos } = (request.body ?? {}) as { aceiteTermos?: boolean }
    if (aceiteTermos === true) {
      await registrarAceiteTermos({
        usuarioId: usuario.id,
        ip: request.ip ?? request.headers['x-forwarded-for']?.toString().split(',')[0]?.trim(),
        userAgent: request.headers['user-agent'],
      })
    }

    /*
     * O designer nasce no plano gratuito.
     *
     * Pelo TIPO e não pela rota: esta função atende tanto `/auth/register`
     * quanto `POST /usuarios`, e o Gratuito é um plano de DESIGNER. Cliente
     * cadastrado pelo designer não assina nada — não é conta que paga o VIU.
     *
     * Falha aqui não recusa o cadastro. Sem a linha, o produto volta ao que
     * fazia antes (a taxa da fatura já resolve o gratuito por ausência), e
     * recusar uma conta porque a tabela de planos está vazia seria trocar um
     * incômodo por uma porta fechada. Mas vai para o log: designer sem
     * assinatura é pergunta de suporte depois.
     */
    if (usuario.tipo === 'DESIGNER') {
      try {
        const assinatura = await assinarPlanoGratuito(usuario.id)
        if (!assinatura) {
          request.log.warn(
            { usuarioId: usuario.id },
            'Cadastro sem assinatura gratuita: nenhum plano gratuito de designer ativo',
          )
        }
      } catch (erro) {
        request.log.error({ err: erro, usuarioId: usuario.id }, 'Falha ao assinar o plano gratuito')
      }
    }

    // Fire-and-forget — não bloqueia o registro se o email falhar
    sendVerificationEmail(usuario.id, usuario.email).catch(() => {})

    reply.status(201).send({ message: 'Usuário criado com sucesso. Verifique seu e-mail para ativar a conta.', data: usuario, success: true })
  } catch (error: any) {
    if (error?.codigo === 'EMAIL_EM_USO' || error.message.includes('Email já está em uso')) {
      /*
       * O `codigo` vai junto porque a tela de cadastro precisa distinguir este
       * caso: é o único com um próximo passo — entrar, ou definir a senha de
       * uma conta que alguém criou para a pessoa. Sem ele, o front teria que
       * casar a frase, e frase é copy.
       */
      reply.status(400).send({ message: error.message, codigo: 'EMAIL_EM_USO', success: false })
      return
    }
    request.log.error({ err: error }, 'Falha inesperada ao criar usuário')
    reply.status(500).send({ message: 'Erro ao criar usuário', success: false })
  }
}

export async function updateUsuario(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const { id } = request.params as { id: string }
    const usuario = await usuarioService.updateUsuario(id, request.body)
    reply.send({ message: 'Usuário atualizado com sucesso', data: usuario, success: true })
  } catch (error: any) {
    if (error.message.includes('Usuário não encontrado')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    if (error.message.includes('Email já está em uso')) {
      reply.status(400).send({ message: error.message, success: false })
      return
    }
    erroInterno(request, reply, error, 'Erro ao atualizar usuário')
  }
}

export async function deactivateUsuario(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const { id } = request.params as { id: string }
    const actor = (request as any).usuario
    await usuarioService.deactivateUsuario(id)

    // LGPD: registra anonimização com IP e user-agent do solicitante
    auditLogService.logSuccess('LGPD_ANONIMIZAR', 'Usuario', {
      resourceId: id,
      usuarioId: actor?.id,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
      details: { solicitadoPor: actor?.id, solicitadoParaId: id },
    }).catch(() => {})

    reply.send({ message: 'Conta removida e dados anonimizados', success: true })
  } catch (error: any) {
    if (error.message.includes('Usuário não encontrado')) {
      reply.status(404).send({ message: error.message, success: false })
      return
    }
    erroInterno(request, reply, error, 'Erro ao remover conta')
  }
}

export async function loginUsuario(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const resultado = await usuarioService.login(request.body)

    // Conta com 2FA ainda não tem sessão: o login só se completa em
    // POST /auth/2fa/login.
    if ((resultado as any).requires2FA) {
      reply.send({ message: 'Verificação de 2FA necessária', data: resultado, success: true })
      return
    }

    const { token, refreshToken, expiresAt, refreshExpiresAt, usuario } = resultado as any
    definirCookiesDeSessao(reply, { token, refreshToken }, { expiresAt, refreshExpiresAt })

    // O token não volta no corpo: se voltasse, qualquer XSS poderia lê-lo da
    // resposta e guardar um bearer que sobrevive à sessão do navegador — que é
    // exatamente o que sair do localStorage veio resolver.
    reply.send({ message: 'Login realizado com sucesso', data: { usuario }, success: true })
  } catch (error: any) {
    if (error.message.includes('Email ou senha inválidos') || error.message.includes('inativo')) {
      reply.status(401).send({ message: error.message, success: false })
      return
    }
    // Sem este log, um 500 aqui vira "Erro no login" na tela e mais nada em
    // lugar nenhum — nem no servidor. Já custou uma sessão inteira de
    // adivinhação em produção: dava para ver a requisição falhando e não o
    // motivo. A mensagem ao usuário continua genérica de propósito; quem
    // precisa do detalhe é quem lê o log.
    request.log.error({ err: error }, 'Falha inesperada no login')
    reply.status(500).send({ message: 'Erro no login', success: false })
  }
}

export async function getCurrentUser(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    // Corrigido: era (request as any).user, deve ser .usuario (definido pelo authMiddleware)
    const userId = (request as any).usuario?.id
    if (!userId) {
      reply.status(401).send({ message: 'Não autorizado', success: false })
      return
    }
    const usuario = await usuarioService.getUsuarioById(userId)
    if (!usuario) {
      reply.status(404).send({ message: 'Usuário não encontrado', success: false })
      return
    }

    /*
     * Quando a sessão é uma impersonação, `/auth/me` diz isso — com o NOME do
     * admin que está dentro, não só o id.
     *
     * É a única rota que toda tela consulta, e por isso o único lugar de onde a
     * faixa de aviso pode nascer sem cada página lembrar de perguntar. O nome
     * vem junto porque um id na faixa não avisa ninguém de nada.
     */
    const impersonadoPorId = (request as any).usuario?.impersonadoPor ?? null
    const impersonacao = impersonadoPorId
      ? await usuarioService.getUsuarioById(impersonadoPorId).then((a) =>
          a ? { adminId: a.id, adminNome: a.nome, adminEmail: a.email } : null,
        )
      : null

    reply.send({ data: { ...usuario, impersonacao }, success: true })
  } catch (erro) {
    request.log.error({ err: erro }, 'Erro ao obter dados do usuário')
    reply.status(500).send({ message: 'Erro ao obter dados do usuário', success: false })
  }
}

export async function uploadAvatar(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const usuario = (request as any).usuario
    const { id } = request.params as { id: string }

    if (usuario?.id !== id) {
      reply.status(403).send({ message: 'Não autorizado', success: false })
      return
    }

    const fileData = (request as any).fileData
    if (!fileData) {
      reply.status(400).send({ message: 'Nenhum arquivo fornecido', success: false })
      return
    }

    if (!fileData.mimetype.startsWith('image/')) {
      reply.status(400).send({ message: 'Apenas imagens são permitidas para avatar', success: false })
      return
    }

    const key = `avatars/${id}/${Date.now()}_${fileData.filename}`
    await uploadFile(key, fileData.buffer, fileData.mimetype)

    // `updateUsuario` já devolve o avatar assinado — a chave crua não carrega
    // em `<img>`, e assinar em dois lugares diferentes foi como a leitura
    // ficou para trás.
    const updated = await usuarioService.updateUsuario(id, { avatar: key })

    reply.send({
      message: 'Avatar atualizado com sucesso',
      data: updated,
      success: true,
    })
  } catch (erro) {
    request.log.error({ err: erro }, 'Erro ao fazer upload do avatar')
    reply.status(500).send({ message: 'Erro ao fazer upload do avatar', success: false })
  }
}

export async function buscarUsuarios(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const { q, limit = 5 } = (request.query || {}) as { q?: string; limit?: number }
    if (!q || q.trim().length < 3) {
      return reply.status(400).send({ message: 'Parâmetro "q" deve ter ao menos 3 caracteres', success: false })
    }
    const data = await usuarioService.buscarUsuarios(q, Number(limit))
    reply.send({ data, success: true })
  } catch (erro) {
    request.log.error({ err: erro }, 'Erro ao buscar usuários')
    reply.status(500).send({ message: 'Erro ao buscar usuários', success: false })
  }
}

export async function statsOverview(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const data = await usuarioService.statsOverview()
    reply.send({ data, success: true })
  } catch (erro) {
    request.log.error({ err: erro }, 'Erro ao buscar estatísticas')
    reply.status(500).send({ message: 'Erro ao buscar estatísticas', success: false })
  }
}
