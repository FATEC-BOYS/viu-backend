import prisma from '../database/client.js'
import bcrypt from 'bcryptjs'
import { SignJWT } from 'jose'
import { getJWTSecret, env } from '../config/env.js'
import { parseJwtExpiry } from '../utils/jwt.js'
import { randomUUID, randomBytes } from 'crypto'
import { assinarAvatar } from '../utils/storage.js'

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

export interface ListUsuariosParams {
  page?: number
  limit?: number
  tipo?: string
  ativo?: string | boolean
}

/**
 * A conta existe mas não pode participar — desativada ou excluída.
 *
 * Erro tipado, não frase: quem lê é o controller, para escolher o status. A
 * mensagem é copy e vai mudar.
 */
/**
 * Já existe conta com este e-mail.
 *
 * Tipado porque a tela precisa DISTINGUIR este caso dos outros erros de
 * cadastro: é o único em que existe um próximo passo, e ele não é "tente de
 * novo". Acontece bastante com quem nunca pediu conta — o designer cadastrou
 * o cliente, e meses depois o cliente tenta se cadastrar sozinho.
 *
 * A frase fica igual de propósito: o controller ainda a usa para escolher o
 * 400, e trocar as duas coisas ao mesmo tempo é como um 422 vira 500 calado.
 */
export class EmailEmUsoError extends Error {
  readonly codigo = 'EMAIL_EM_USO'
  constructor() {
    super('Email já está em uso')
    this.name = 'EmailEmUsoError'
  }
}

export class ContaIndisponivelError extends Error {
  readonly codigo = 'CONTA_INDISPONIVEL'
  constructor() {
    super('Esta conta não está mais ativa no VIU.')
    this.name = 'ContaIndisponivelError'
  }
}

export class UsuarioService {
  private async signToken(usuario: {
    id: string
    email: string
    nome: string
    tipo: string
  }): Promise<{ token: string; expiresAt: Date; refreshToken: string; refreshExpiresAt: Date }> {
    const secret = new TextEncoder().encode(getJWTSecret())
    const jti = randomUUID()
    const expiresAt = parseJwtExpiry(env.JWT_EXPIRES_IN)
    const token = await new SignJWT({
      email: usuario.email,
      nome: usuario.nome,
      tipo: usuario.tipo,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(usuario.id)
      .setExpirationTime(env.JWT_EXPIRES_IN)
      .setIssuedAt()
      .setJti(jti)
      .sign(secret)

    const refreshToken = randomBytes(32).toString('hex')
    const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS)
    return { token, expiresAt, refreshToken, refreshExpiresAt }
  }

  async buscarUsuarios(q: string, limit = 5) {
    const termo = q.trim()
    return prisma.usuario.findMany({
      where: {
        ativo: true,
        OR: [
          { nome: { contains: termo, mode: 'insensitive' } },
          { email: { contains: termo, mode: 'insensitive' } },
        ],
      },
      take: Math.min(limit, 20),
      select: { id: true, nome: true, email: true, avatar: true, tipo: true },
      orderBy: { nome: 'asc' },
    })
  }

  async listUsuarios({ page = 1, limit = 10, tipo, ativo }: ListUsuariosParams) {
    const skip = (page - 1) * limit
    let ativoFilter: boolean | undefined
    if (ativo !== undefined && ativo !== null) {
      if (typeof ativo === 'string') {
        ativoFilter = ativo === 'true'
      } else {
        ativoFilter = ativo
      }
    }
    const where: any = {
      ...(tipo && { tipo }),
      ...(ativoFilter !== undefined && { ativo: ativoFilter }),
    }
    const [usuarios, total] = await Promise.all([
      prisma.usuario.findMany({
        where,
        skip,
        take: Number(limit),
        select: {
          id: true,
          email: true,
          nome: true,
          telefone: true,
          avatar: true,
          tipo: true,
          ativo: true,
          criadoEm: true,
          /*
           * O que sobra de uma conta excluída, e é o que o painel mostra: a
           * data do pedido, o tipo, quando entrou, e o volume que ficou para
           * trás. Nada disso é PII — nome, e-mail, telefone e avatar já foram
           * anonimizados, e é por isso que estes campos podem continuar
           * visíveis.
           */
          excluidoEm: true,
          _count: {
            select: {
              projetosDesigner: true,
              projetosCliente: true,
              artes: true,
            },
          },
        },
        orderBy: { criadoEm: 'desc' },
      }),
      prisma.usuario.count({ where }),
    ])
    return { usuarios, total }
  }

  async getUsuarioById(id: string) {
    const usuario = await prisma.usuario.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        nome: true,
        telefone: true,
        avatar: true,
        tipo: true,
        ativo: true,
        // Alimenta /auth/me, que o AuthProvider consulta em toda carga de
        // página. Sem este campo o perfil voltava sem ele, `emailVerificado`
        // virava undefined no cliente e o aviso de confirmação sumia da tela
        // — inclusive para quem não tinha confirmado nada.
        emailVerificado: true,
        criadoEm: true,
        atualizadoEm: true,
        _count: {
          select: {
            projetosDesigner: true,
            projetosCliente: true,
            artes: true,
            feedbacks: true,
            aprovacoes: true,
            tarefas: true,
          },
        },
      },
    })
    if (!usuario) return usuario
    /**
     * O upload guarda a chave do R2, que não carrega em `<img>`. Assinar só
     * na resposta do upload fazia a foto aparecer e sumir no primeiro reload,
     * porque é daqui que vêm /auth/me e a tela de perfil.
     */
    return { ...usuario, avatar: await assinarAvatar(usuario.avatar) }
  }

  async createUsuario(userData: any) {
    const existingUser = await prisma.usuario.findUnique({
      where: { email: userData.email },
    })
    if (existingUser) {
      throw new EmailEmUsoError()
    }
    const senhaHash = await bcrypt.hash(userData.senha, 10)
    /*
     * Campos listados, não `{ ...userData }`.
     *
     * O spread mandava para o Prisma tudo que viesse no corpo. Qualquer campo
     * novo no schema de validação que não fosse coluna quebrava o cadastro
     * inteiro — foi o que quase aconteceu quando `aceiteTermos` entrou —, e
     * qualquer campo que POR ACASO fosse coluna entrava sem ninguém decidir:
     * `ativo`, `tipo` privilegiado, `emailVerificado`. A lista explícita é a
     * fronteira entre o que o formulário manda e o que o banco aceita.
     */
    const usuario = await prisma.usuario.create({
      data: {
        email: userData.email,
        senha: senhaHash,
        nome: userData.nome,
        telefone: userData.telefone,
        tipo: userData.tipo,
      },
      select: {
        id: true,
        email: true,
        nome: true,
        telefone: true,
        avatar: true,
        tipo: true,
        ativo: true,
        criadoEm: true,
      },
    })
    return usuario
  }

  /**
   * O designer não cria uma conta — ele APONTA uma pessoa.
   *
   * O wizard chamava "criar usuário" e batia em "Email já está em uso" sempre
   * que a pessoa já tinha conta: porque se cadastrou sozinha, ou porque outro
   * designer já a cadastrara. E não havia saída — `GET /usuarios` é ADMIN-only
   * e a busca do produto varre projetos e artes, não pessoas. O designer então
   * inventava um segundo e-mail, e a mesma pessoa ficava com duas contas e a
   * fila de decisões partida ao meio.
   *
   * Aqui a pergunta passa a ser a certa: "quem é `email`?". Se ninguém, cria.
   *
   * Isto NÃO coloca ninguém num projeto: quem faz isso é `POST /projetos`, que
   * nasce em RASCUNHO e dispara convite — a outra parte aceita antes de o
   * projeto andar. O consentimento continua onde sempre esteve.
   *
   * A resposta diz se a conta já existia, e ela precisa dizer: é o que decide
   * a frase na tela e se o designer pode seguir. Isso revela que aquele e-mail
   * tem conta no VIU — limitado a `CLIENTES_MAX_HORA` por designer, que é o
   * mesmo balde que já segurava a criação.
   */
  async resolverCliente(dados: { email: string; nome: string; telefone?: string }) {
    const existente = await prisma.usuario.findUnique({
      where: { email: dados.email },
      select: { id: true, nome: true, email: true, ativo: true, excluidoEm: true },
    })

    if (existente) {
      if (!existente.ativo || existente.excluidoEm) {
        throw new ContaIndisponivelError()
      }
      // O nome de quem já tem conta é dela, não do formulário: sobrescrever
      // deixaria um terceiro renomear a conta alheia.
      return { usuario: { id: existente.id, nome: existente.nome, email: existente.email }, jaExistia: true }
    }

    /*
     * Senha temporária gerada AQUI, e não no navegador do designer.
     *
     * Antes o wizard sorteava a senha no cliente — quem cadastra escolhendo a
     * credencial de outra pessoa, ainda que descartável. O caminho de entrada
     * da pessoa é o "esqueci minha senha", como já era; esta senha só existe
     * porque a coluna não aceita nulo na criação.
     */
    const senha = `Viu@${randomBytes(18).toString('base64url')}`
    const criado = await this.createUsuario({
      email: dados.email,
      nome: dados.nome,
      telefone: dados.telefone,
      senha,
      tipo: 'CLIENTE',
    })

    return { usuario: { id: criado.id, nome: criado.nome, email: criado.email }, jaExistia: false }
  }

  async updateUsuario(id: string, updateData: any) {
    const existingUser = await prisma.usuario.findUnique({ where: { id } })
    if (!existingUser) {
      throw new Error('Usuário não encontrado')
    }
    if (updateData.email && updateData.email !== existingUser.email) {
      const emailExists = await prisma.usuario.findUnique({ where: { email: updateData.email } })
      if (emailExists) {
        throw new Error('Email já está em uso')
      }
    }
    // Whitelist-only — never allow tipo, ativo, twoFactor*, id via this endpoint
    const dataToUpdate: Record<string, any> = {}
    const allowedFields = ['email', 'nome', 'telefone', 'avatar'] as const
    for (const field of allowedFields) {
      if (updateData[field] !== undefined) dataToUpdate[field] = updateData[field]
    }
    if (updateData.senha) {
      dataToUpdate.senha = await bcrypt.hash(updateData.senha, 10)
    }
    const usuario = await prisma.usuario.update({
      where: { id },
      data: dataToUpdate,
      select: {
        id: true,
        email: true,
        nome: true,
        telefone: true,
        avatar: true,
        tipo: true,
        ativo: true,
        atualizadoEm: true,
      },
    })
    return { ...usuario, avatar: await assinarAvatar(usuario.avatar) }
  }

  async deactivateUsuario(id: string) {
    const existingUser = await prisma.usuario.findUnique({ where: { id } })
    if (!existingUser) {
      throw new Error('Usuário não encontrado')
    }

    // LGPD Art. 18 IV: anonimiza PII em vez de deletar fisicamente.
    // Email único: usa deleted+<id>@removed.viu.app para preservar a constraint.
    // Registros financeiros e contratuais permanecem intactos (obrigação fiscal de 5 anos).
    await prisma.$transaction([
      prisma.usuario.update({
        where: { id },
        data: {
          ativo: false,
          // A data do atendimento ao pedido. Sem ela ficava só `ativo: false`,
          // que não distingue conta excluída de conta desativada nem diz
          // quando — e é justamente o que o painel precisa mostrar depois.
          excluidoEm: new Date(),
          nome: 'Usuário Removido',
          email: `deleted+${id}@removed.viu.app`,
          telefone: null,
          avatar: null,
          senha: null,
          emailVerificado: false,
          emailVerificacaoToken: null,
          emailVerificacaoExpiresAt: null,
          passwordResetToken: null,
          passwordResetExpiresAt: null,
          twoFactorEnabled: false,
          twoFactorSecret: null,
          twoFactorBackupCodes: [],
        },
      }),
      // Invalida todas as sessões ativas
      prisma.sessao.updateMany({
        where: { usuarioId: id, ativo: true },
        data: { ativo: false },
      }),
    ])
  }

  async login(loginData: any) {
    const usuario = await prisma.usuario.findUnique({
      where: { email: loginData.email },
      select: {
        id: true,
        email: true,
        senha: true,
        nome: true,
        tipo: true,
        avatar: true,
        ativo: true,
        twoFactorEnabled: true,
        emailVerificado: true,
      },
    })

    if (!usuario || !usuario.ativo) {
      throw new Error('Email ou senha inválidos ou usuário inativo')
    }

    if (!usuario.senha) {
      throw new Error(
        'Esta conta foi criada com login social. Use o método de login original.',
      )
    }

    const senhaValida = await bcrypt.compare(loginData.senha, usuario.senha)
    if (!senhaValida) {
      throw new Error('Email ou senha inválidos')
    }

    if (usuario.twoFactorEnabled) {
      return {
        requires2FA: true,
        userId: usuario.id,
        message: 'Verificação de 2FA necessária',
      }
    }

    const { token, expiresAt, refreshToken, refreshExpiresAt } = await this.signToken(usuario)

    await prisma.sessao.create({
      data: { token, expiresAt, usuarioId: usuario.id, refreshToken, refreshExpiresAt },
    })

    // Os prazos saem daqui para que o cookie de sessão expire junto com o
    // token no banco — cookie que sobrevive ao token vira 401 silencioso.
    return {
      token,
      refreshToken,
      expiresAt,
      refreshExpiresAt,
      usuario: {
        id: usuario.id,
        email: usuario.email,
        nome: usuario.nome,
        tipo: usuario.tipo,
        avatar: await assinarAvatar(usuario.avatar),
        emailVerificado: usuario.emailVerificado,
      },
    }
  }

  async refresh(refreshToken: string) {
    const sessao = await prisma.sessao.findFirst({
      where: {
        refreshToken,
        ativo: true,
        refreshExpiresAt: { gt: new Date() },
      },
      include: {
        usuario: {
          select: { id: true, email: true, nome: true, tipo: true, avatar: true, ativo: true, emailVerificado: true },
        },
      },
    })

    if (!sessao || !sessao.usuario.ativo) {
      throw new Error('Refresh token inválido ou expirado')
    }

    await prisma.sessao.update({ where: { id: sessao.id }, data: { ativo: false } })

    const { token, expiresAt, refreshToken: newRefresh, refreshExpiresAt } = await this.signToken(sessao.usuario)
    await prisma.sessao.create({
      data: { token, expiresAt, usuarioId: sessao.usuarioId, refreshToken: newRefresh, refreshExpiresAt },
    })

    return {
      token,
      refreshToken: newRefresh,
      expiresAt,
      refreshExpiresAt,
      usuario: {
        id: sessao.usuario.id,
        email: sessao.usuario.email,
        nome: sessao.usuario.nome,
        tipo: sessao.usuario.tipo,
        avatar: await assinarAvatar(sessao.usuario.avatar),
        emailVerificado: sessao.usuario.emailVerificado,
      },
    }
  }

  async logout(token: string) {
    await prisma.sessao.updateMany({ where: { token }, data: { ativo: false } })
  }

  async completeTwoFactorLogin(userId: string) {
    const usuario = await prisma.usuario.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        nome: true,
        tipo: true,
        avatar: true,
        ativo: true,
        emailVerificado: true,
      },
    })

    if (!usuario || !usuario.ativo) {
      throw new Error('Usuário não encontrado ou inativo')
    }

    const { token, expiresAt, refreshToken, refreshExpiresAt } = await this.signToken(usuario)

    await prisma.sessao.create({
      data: { token, expiresAt, usuarioId: usuario.id, refreshToken, refreshExpiresAt },
    })

    return {
      token,
      refreshToken,
      expiresAt,
      refreshExpiresAt,
      usuario: {
        id: usuario.id,
        email: usuario.email,
        nome: usuario.nome,
        tipo: usuario.tipo,
        avatar: await assinarAvatar(usuario.avatar),
        emailVerificado: usuario.emailVerificado,
      },
    }
  }

  async statsOverview() {
    const [total, designers, clientes, admins, ativos] = await Promise.all([
      prisma.usuario.count(),
      prisma.usuario.count({ where: { tipo: 'DESIGNER' } }),
      prisma.usuario.count({ where: { tipo: 'CLIENTE' } }),
      prisma.usuario.count({ where: { tipo: 'ADMIN' } }),
      prisma.usuario.count({ where: { ativo: true } }),
    ])
    return {
      total,
      porTipo: { designers, clientes, admins },
      ativos,
      inativos: total - ativos,
      percentualAtivos: total > 0 ? Math.round((ativos / total) * 100) : 0,
    }
  }
}
