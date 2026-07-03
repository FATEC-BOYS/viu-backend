-- =====================================================================
-- VIU Backend — Baseline Migration
-- Schema completo gerado do prisma/schema.prisma
-- Aplicar via: prisma migrate deploy
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Função utilitária para atualizar atualizadoEm automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW."atualizadoEm" = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- usuarios
-- =====================================================================
CREATE TABLE IF NOT EXISTS usuarios (
  id                          TEXT        NOT NULL DEFAULT ('c' || encode(gen_random_bytes(12), 'hex')),
  email                       TEXT        NOT NULL,
  senha                       TEXT,
  nome                        TEXT        NOT NULL,
  telefone                    TEXT,
  avatar                      TEXT,
  tipo                        TEXT        NOT NULL DEFAULT 'DESIGNER',
  ativo                       BOOLEAN     NOT NULL DEFAULT true,
  -- 2FA
  "twoFactorEnabled"          BOOLEAN     NOT NULL DEFAULT false,
  "twoFactorSecret"           TEXT,
  "twoFactorBackupCodes"      TEXT[]      NOT NULL DEFAULT '{}',
  -- Email verification
  "emailVerificado"           BOOLEAN     NOT NULL DEFAULT false,
  "emailVerificacaoToken"     TEXT,
  "emailVerificacaoExpiresAt" TIMESTAMP(3),
  -- Password reset
  "passwordResetToken"        TEXT,
  "passwordResetExpiresAt"    TIMESTAMP(3),
  -- Timestamps
  "criadoEm"                  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT usuarios_pkey               PRIMARY KEY (id),
  CONSTRAINT usuarios_email_key          UNIQUE (email),
  CONSTRAINT usuarios_emailVerToken_key  UNIQUE ("emailVerificacaoToken"),
  CONSTRAINT usuarios_pwdResetToken_key  UNIQUE ("passwordResetToken")
);

CREATE INDEX IF NOT EXISTS usuarios_email_idx    ON usuarios(email);
CREATE INDEX IF NOT EXISTS usuarios_tipo_idx     ON usuarios(tipo);
CREATE INDEX IF NOT EXISTS usuarios_ativo_idx    ON usuarios(ativo);
CREATE INDEX IF NOT EXISTS usuarios_criadoEm_idx ON usuarios("criadoEm");

CREATE TRIGGER update_usuarios_updated_at
  BEFORE UPDATE ON usuarios
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================
-- equipes (declarada antes de projetos por ser referenciada em projetos)
-- =====================================================================
CREATE TABLE IF NOT EXISTS equipes (
  id                TEXT        NOT NULL DEFAULT ('c' || encode(gen_random_bytes(12), 'hex')),
  nome              TEXT        NOT NULL,
  slug              TEXT        NOT NULL,
  "donoPrincipalId" TEXT        NOT NULL,
  "criadoEm"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT equipes_pkey     PRIMARY KEY (id),
  CONSTRAINT equipes_slug_key UNIQUE (slug),
  CONSTRAINT equipes_donoPrincipalId_fkey
    FOREIGN KEY ("donoPrincipalId") REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS equipes_donoPrincipalId_idx ON equipes("donoPrincipalId");
CREATE INDEX IF NOT EXISTS equipes_slug_idx             ON equipes(slug);

CREATE TRIGGER update_equipes_updated_at
  BEFORE UPDATE ON equipes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================
-- projetos
-- =====================================================================
CREATE TABLE IF NOT EXISTS projetos (
  id            TEXT        NOT NULL DEFAULT ('c' || encode(gen_random_bytes(12), 'hex')),
  nome          TEXT        NOT NULL,
  descricao     TEXT,
  status        TEXT        NOT NULL DEFAULT 'EM_ANDAMENTO',
  orcamento     INTEGER,
  prazo         TIMESTAMP(3),
  "designerId"  TEXT        NOT NULL,
  "clienteId"   TEXT        NOT NULL,
  "equipeId"    TEXT,
  "criadoEm"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT projetos_pkey           PRIMARY KEY (id),
  CONSTRAINT projetos_designerId_fkey
    FOREIGN KEY ("designerId") REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT projetos_clienteId_fkey
    FOREIGN KEY ("clienteId")  REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT projetos_equipeId_fkey
    FOREIGN KEY ("equipeId")   REFERENCES equipes(id)  ON DELETE SET NULL  ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS projetos_designerId_idx ON projetos("designerId");
CREATE INDEX IF NOT EXISTS projetos_clienteId_idx  ON projetos("clienteId");
CREATE INDEX IF NOT EXISTS projetos_equipeId_idx   ON projetos("equipeId");
CREATE INDEX IF NOT EXISTS projetos_status_idx     ON projetos(status);
CREATE INDEX IF NOT EXISTS projetos_criadoEm_idx   ON projetos("criadoEm");

CREATE TRIGGER update_projetos_updated_at
  BEFORE UPDATE ON projetos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================
-- equipe_membros
-- =====================================================================
CREATE TABLE IF NOT EXISTS equipe_membros (
  "equipeId"  TEXT        NOT NULL,
  "usuarioId" TEXT        NOT NULL,
  papel       TEXT        NOT NULL,
  "criadoEm"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT equipe_membros_pkey PRIMARY KEY ("equipeId", "usuarioId"),
  CONSTRAINT equipe_membros_equipeId_fkey
    FOREIGN KEY ("equipeId")  REFERENCES equipes(id)   ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT equipe_membros_usuarioId_fkey
    FOREIGN KEY ("usuarioId") REFERENCES usuarios(id)  ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS equipe_membros_usuarioId_idx ON equipe_membros("usuarioId");

-- =====================================================================
-- artes
-- =====================================================================
CREATE TABLE IF NOT EXISTS artes (
  id            TEXT        NOT NULL DEFAULT ('c' || encode(gen_random_bytes(12), 'hex')),
  nome          TEXT        NOT NULL,
  descricao     TEXT,
  arquivo       TEXT        NOT NULL,
  tipo          TEXT        NOT NULL,
  tamanho       INTEGER     NOT NULL,
  versao        INTEGER     NOT NULL DEFAULT 1,
  status        TEXT        NOT NULL DEFAULT 'EM_ANALISE',
  "projetoId"   TEXT        NOT NULL,
  "autorId"     TEXT        NOT NULL,
  "criadoEm"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT artes_pkey          PRIMARY KEY (id),
  CONSTRAINT artes_projetoId_fkey
    FOREIGN KEY ("projetoId") REFERENCES projetos(id) ON DELETE CASCADE  ON UPDATE CASCADE,
  CONSTRAINT artes_autorId_fkey
    FOREIGN KEY ("autorId")   REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS artes_projetoId_idx ON artes("projetoId");
CREATE INDEX IF NOT EXISTS artes_autorId_idx   ON artes("autorId");
CREATE INDEX IF NOT EXISTS artes_status_idx    ON artes(status);
CREATE INDEX IF NOT EXISTS artes_tipo_idx      ON artes(tipo);
CREATE INDEX IF NOT EXISTS artes_criadoEm_idx  ON artes("criadoEm");

CREATE TRIGGER update_artes_updated_at
  BEFORE UPDATE ON artes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================
-- feedbacks
-- =====================================================================
CREATE TABLE IF NOT EXISTS feedbacks (
  id           TEXT             NOT NULL DEFAULT ('c' || encode(gen_random_bytes(12), 'hex')),
  conteudo     TEXT             NOT NULL,
  tipo         TEXT             NOT NULL DEFAULT 'TEXTO',
  arquivo      TEXT,
  "posicaoX"   DOUBLE PRECISION,
  "posicaoY"   DOUBLE PRECISION,
  transcricao  TEXT,
  "audioGerado" TEXT,
  publico      BOOLEAN          NOT NULL DEFAULT true,
  "arteId"     TEXT             NOT NULL,
  "autorId"    TEXT             NOT NULL,
  "criadoEm"   TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT feedbacks_pkey        PRIMARY KEY (id),
  CONSTRAINT feedbacks_arteId_fkey
    FOREIGN KEY ("arteId")  REFERENCES artes(id)    ON DELETE CASCADE  ON UPDATE CASCADE,
  CONSTRAINT feedbacks_autorId_fkey
    FOREIGN KEY ("autorId") REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS feedbacks_arteId_idx  ON feedbacks("arteId");
CREATE INDEX IF NOT EXISTS feedbacks_autorId_idx ON feedbacks("autorId");
CREATE INDEX IF NOT EXISTS feedbacks_tipo_idx    ON feedbacks(tipo);
CREATE INDEX IF NOT EXISTS feedbacks_criadoEm_idx ON feedbacks("criadoEm");

-- =====================================================================
-- aprovacoes
-- =====================================================================
CREATE TABLE IF NOT EXISTS aprovacoes (
  id            TEXT        NOT NULL DEFAULT ('c' || encode(gen_random_bytes(12), 'hex')),
  status        TEXT        NOT NULL DEFAULT 'PENDENTE',
  comentario    TEXT,
  "arteId"      TEXT        NOT NULL,
  "aprovadorId" TEXT        NOT NULL,
  "criadoEm"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT aprovacoes_pkey           PRIMARY KEY (id),
  CONSTRAINT aprovacoes_arteId_fkey
    FOREIGN KEY ("arteId")      REFERENCES artes(id)    ON DELETE CASCADE  ON UPDATE CASCADE,
  CONSTRAINT aprovacoes_aprovadorId_fkey
    FOREIGN KEY ("aprovadorId") REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS aprovacoes_arteId_idx     ON aprovacoes("arteId");
CREATE INDEX IF NOT EXISTS aprovacoes_aprovadorId_idx ON aprovacoes("aprovadorId");
CREATE INDEX IF NOT EXISTS aprovacoes_status_idx     ON aprovacoes(status);
CREATE INDEX IF NOT EXISTS aprovacoes_criadoEm_idx   ON aprovacoes("criadoEm");

-- =====================================================================
-- tarefas
-- =====================================================================
CREATE TABLE IF NOT EXISTS tarefas (
  id              TEXT        NOT NULL DEFAULT ('c' || encode(gen_random_bytes(12), 'hex')),
  titulo          TEXT        NOT NULL,
  descricao       TEXT,
  status          TEXT        NOT NULL DEFAULT 'PENDENTE',
  prioridade      TEXT        NOT NULL DEFAULT 'MEDIA',
  prazo           TIMESTAMP(3),
  "projetoId"     TEXT,
  "responsavelId" TEXT        NOT NULL,
  "criadoEm"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT tarefas_pkey              PRIMARY KEY (id),
  CONSTRAINT tarefas_projetoId_fkey
    FOREIGN KEY ("projetoId")     REFERENCES projetos(id)  ON DELETE CASCADE  ON UPDATE CASCADE,
  CONSTRAINT tarefas_responsavelId_fkey
    FOREIGN KEY ("responsavelId") REFERENCES usuarios(id)  ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS tarefas_projetoId_idx     ON tarefas("projetoId");
CREATE INDEX IF NOT EXISTS tarefas_responsavelId_idx ON tarefas("responsavelId");
CREATE INDEX IF NOT EXISTS tarefas_status_idx        ON tarefas(status);
CREATE INDEX IF NOT EXISTS tarefas_prioridade_idx    ON tarefas(prioridade);
CREATE INDEX IF NOT EXISTS tarefas_prazo_idx         ON tarefas(prazo);

CREATE TRIGGER update_tarefas_updated_at
  BEFORE UPDATE ON tarefas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================
-- notificacoes
-- =====================================================================
CREATE TABLE IF NOT EXISTS notificacoes (
  id          TEXT        NOT NULL DEFAULT ('c' || encode(gen_random_bytes(12), 'hex')),
  titulo      TEXT        NOT NULL,
  conteudo    TEXT        NOT NULL,
  tipo        TEXT        NOT NULL,
  canal       TEXT        NOT NULL DEFAULT 'SISTEMA',
  lida        BOOLEAN     NOT NULL DEFAULT false,
  "usuarioId" TEXT        NOT NULL,
  "criadoEm"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT notificacoes_pkey         PRIMARY KEY (id),
  CONSTRAINT notificacoes_usuarioId_fkey
    FOREIGN KEY ("usuarioId") REFERENCES usuarios(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS notificacoes_usuarioId_idx ON notificacoes("usuarioId");
CREATE INDEX IF NOT EXISTS notificacoes_tipo_idx      ON notificacoes(tipo);
CREATE INDEX IF NOT EXISTS notificacoes_lida_idx      ON notificacoes(lida);
CREATE INDEX IF NOT EXISTS notificacoes_criadoEm_idx  ON notificacoes("criadoEm");

-- =====================================================================
-- sessoes
-- =====================================================================
CREATE TABLE IF NOT EXISTS sessoes (
  id                TEXT        NOT NULL DEFAULT ('c' || encode(gen_random_bytes(12), 'hex')),
  token             TEXT        NOT NULL,
  "expiresAt"       TIMESTAMP(3) NOT NULL,
  "refreshToken"    TEXT,
  "refreshExpiresAt" TIMESTAMP(3),
  ativo             BOOLEAN     NOT NULL DEFAULT true,
  "usuarioId"       TEXT        NOT NULL,
  "criadoEm"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT sessoes_pkey               PRIMARY KEY (id),
  CONSTRAINT sessoes_token_key          UNIQUE (token),
  CONSTRAINT sessoes_refreshToken_key   UNIQUE ("refreshToken"),
  CONSTRAINT sessoes_usuarioId_fkey
    FOREIGN KEY ("usuarioId") REFERENCES usuarios(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS sessoes_usuarioId_idx    ON sessoes("usuarioId");
CREATE INDEX IF NOT EXISTS sessoes_token_idx        ON sessoes(token);
CREATE INDEX IF NOT EXISTS sessoes_refreshToken_idx ON sessoes("refreshToken");
CREATE INDEX IF NOT EXISTS sessoes_expiresAt_idx    ON sessoes("expiresAt");
CREATE INDEX IF NOT EXISTS sessoes_ativo_idx        ON sessoes(ativo);

-- =====================================================================
-- audit_logs
-- =====================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id             TEXT        NOT NULL DEFAULT ('c' || encode(gen_random_bytes(12), 'hex')),
  action         TEXT        NOT NULL,
  resource       TEXT        NOT NULL,
  "resourceId"   TEXT,
  details        JSONB,
  "ipAddress"    TEXT,
  "userAgent"    TEXT,
  status         TEXT        NOT NULL,
  "errorMessage" TEXT,
  "usuarioId"    TEXT,
  "criadoEm"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT audit_logs_pkey         PRIMARY KEY (id),
  CONSTRAINT audit_logs_usuarioId_fkey
    FOREIGN KEY ("usuarioId") REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS audit_logs_usuarioId_idx ON audit_logs("usuarioId");
CREATE INDEX IF NOT EXISTS audit_logs_action_idx    ON audit_logs(action);
CREATE INDEX IF NOT EXISTS audit_logs_resource_idx  ON audit_logs(resource);
CREATE INDEX IF NOT EXISTS audit_logs_status_idx    ON audit_logs(status);
CREATE INDEX IF NOT EXISTS audit_logs_criadoEm_idx  ON audit_logs("criadoEm");

-- =====================================================================
-- security_events
-- =====================================================================
CREATE TABLE IF NOT EXISTS security_events (
  id           TEXT        NOT NULL DEFAULT ('c' || encode(gen_random_bytes(12), 'hex')),
  "eventType"  TEXT        NOT NULL,
  severity     TEXT        NOT NULL,
  description  TEXT        NOT NULL,
  details      JSONB,
  "ipAddress"  TEXT,
  "userAgent"  TEXT,
  location     TEXT,
  "usuarioId"  TEXT,
  resolved     BOOLEAN     NOT NULL DEFAULT false,
  "resolvedAt" TIMESTAMP(3),
  "resolvedBy" TEXT,
  "criadoEm"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT security_events_pkey         PRIMARY KEY (id),
  CONSTRAINT security_events_usuarioId_fkey
    FOREIGN KEY ("usuarioId") REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS security_events_usuarioId_idx  ON security_events("usuarioId");
CREATE INDEX IF NOT EXISTS security_events_eventType_idx  ON security_events("eventType");
CREATE INDEX IF NOT EXISTS security_events_severity_idx   ON security_events(severity);
CREATE INDEX IF NOT EXISTS security_events_resolved_idx   ON security_events(resolved);
CREATE INDEX IF NOT EXISTS security_events_criadoEm_idx   ON security_events("criadoEm");

-- =====================================================================
-- link_compartilhado
-- =====================================================================
CREATE TABLE IF NOT EXISTS link_compartilhado (
  id                TEXT        NOT NULL DEFAULT ('c' || encode(gen_random_bytes(12), 'hex')),
  token             TEXT        NOT NULL,
  tipo              TEXT        NOT NULL,
  "arteId"          TEXT,
  "somenteLeitura"  BOOLEAN     NOT NULL DEFAULT true,
  "expiraEm"        TIMESTAMP(3),
  revogado          BOOLEAN     NOT NULL DEFAULT false,
  "limiteTentativas" INTEGER,
  acessos           INTEGER     NOT NULL DEFAULT 0,
  "criadoEm"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT link_compartilhado_pkey      PRIMARY KEY (id),
  CONSTRAINT link_compartilhado_token_key UNIQUE (token),
  CONSTRAINT link_compartilhado_arteId_fkey
    FOREIGN KEY ("arteId") REFERENCES artes(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS link_compartilhado_token_idx    ON link_compartilhado(token);
CREATE INDEX IF NOT EXISTS link_compartilhado_arteId_idx   ON link_compartilhado("arteId");
CREATE INDEX IF NOT EXISTS link_compartilhado_expiraEm_idx ON link_compartilhado("expiraEm");
CREATE INDEX IF NOT EXISTS link_compartilhado_revogado_idx ON link_compartilhado(revogado);

-- =====================================================================
-- planos
-- =====================================================================
CREATE TABLE IF NOT EXISTS planos (
  id                TEXT        NOT NULL DEFAULT ('c' || encode(gen_random_bytes(12), 'hex')),
  nome              TEXT        NOT NULL,
  tipo              TEXT        NOT NULL,
  "precoMensal"     INTEGER     NOT NULL,
  "precoAnual"      INTEGER,
  "taxaPlataforma"  DOUBLE PRECISION NOT NULL DEFAULT 0.10,
  "limitesProjetos" INTEGER,
  "limitesArtes"    INTEGER,
  "limitesStorageMb" INTEGER,
  descricao         TEXT,
  ativo             BOOLEAN     NOT NULL DEFAULT true,
  "criadoEm"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT planos_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS planos_tipo_idx  ON planos(tipo);
CREATE INDEX IF NOT EXISTS planos_ativo_idx ON planos(ativo);

CREATE TRIGGER update_planos_updated_at
  BEFORE UPDATE ON planos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================
-- assinaturas
-- =====================================================================
CREATE TABLE IF NOT EXISTS assinaturas (
  id                   TEXT        NOT NULL DEFAULT ('c' || encode(gen_random_bytes(12), 'hex')),
  status               TEXT        NOT NULL DEFAULT 'PENDENTE',
  "periodoInicio"      TIMESTAMP(3),
  "periodoFim"         TIMESTAMP(3),
  "renovacaoAutomatica" BOOLEAN    NOT NULL DEFAULT true,
  "mpPreapprovalId"    TEXT,
  "mpPlanId"           TEXT,
  "usuarioId"          TEXT        NOT NULL,
  "planoId"            TEXT        NOT NULL,
  "criadoEm"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT assinaturas_pkey                PRIMARY KEY (id),
  CONSTRAINT assinaturas_mpPreapprovalId_key UNIQUE ("mpPreapprovalId"),
  CONSTRAINT assinaturas_usuarioId_fkey
    FOREIGN KEY ("usuarioId") REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT assinaturas_planoId_fkey
    FOREIGN KEY ("planoId")   REFERENCES planos(id)
);

CREATE INDEX IF NOT EXISTS assinaturas_usuarioId_idx ON assinaturas("usuarioId");
CREATE INDEX IF NOT EXISTS assinaturas_status_idx    ON assinaturas(status);

CREATE TRIGGER update_assinaturas_updated_at
  BEFORE UPDATE ON assinaturas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================
-- faturas
-- =====================================================================
CREATE TABLE IF NOT EXISTS faturas (
  id                    TEXT        NOT NULL DEFAULT ('c' || encode(gen_random_bytes(12), 'hex')),
  valor                 INTEGER     NOT NULL,
  "taxaPlataforma"      INTEGER     NOT NULL,
  "valorLiquidoDesigner" INTEGER    NOT NULL,
  status                TEXT        NOT NULL DEFAULT 'PENDENTE',
  "dataVencimento"      TIMESTAMP(3),
  "dataPagamento"       TIMESTAMP(3),
  descricao             TEXT,
  "projetoId"           TEXT        NOT NULL,
  "clienteId"           TEXT        NOT NULL,
  "designerId"          TEXT        NOT NULL,
  "criadoEm"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT faturas_pkey         PRIMARY KEY (id),
  CONSTRAINT faturas_projetoId_fkey
    FOREIGN KEY ("projetoId")  REFERENCES projetos(id)  ON DELETE RESTRICT,
  CONSTRAINT faturas_clienteId_fkey
    FOREIGN KEY ("clienteId")  REFERENCES usuarios(id)  ON DELETE RESTRICT,
  CONSTRAINT faturas_designerId_fkey
    FOREIGN KEY ("designerId") REFERENCES usuarios(id)  ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS faturas_projetoId_idx  ON faturas("projetoId");
CREATE INDEX IF NOT EXISTS faturas_clienteId_idx  ON faturas("clienteId");
CREATE INDEX IF NOT EXISTS faturas_designerId_idx ON faturas("designerId");
CREATE INDEX IF NOT EXISTS faturas_status_idx     ON faturas(status);

CREATE TRIGGER update_faturas_updated_at
  BEFORE UPDATE ON faturas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================
-- pagamentos
-- =====================================================================
CREATE TABLE IF NOT EXISTS pagamentos (
  id               TEXT        NOT NULL DEFAULT ('c' || encode(gen_random_bytes(12), 'hex')),
  tipo             TEXT        NOT NULL,
  status           TEXT        NOT NULL DEFAULT 'PENDENTE',
  valor            INTEGER     NOT NULL,
  "metodoPagamento" TEXT,
  "mpPaymentId"    TEXT,
  "mpPreferenceId" TEXT,
  "mpStatus"       TEXT,
  "mpQrCode"       TEXT,
  "mpQrCodeText"   TEXT,
  "usuarioId"      TEXT        NOT NULL,
  "assinaturaId"   TEXT,
  "faturaId"       TEXT,
  "criadoEm"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT pagamentos_pkey             PRIMARY KEY (id),
  CONSTRAINT pagamentos_mpPaymentId_key  UNIQUE ("mpPaymentId"),
  CONSTRAINT pagamentos_faturaId_key     UNIQUE ("faturaId"),
  CONSTRAINT pagamentos_usuarioId_fkey
    FOREIGN KEY ("usuarioId")    REFERENCES usuarios(id)    ON DELETE RESTRICT,
  CONSTRAINT pagamentos_assinaturaId_fkey
    FOREIGN KEY ("assinaturaId") REFERENCES assinaturas(id) ON DELETE SET NULL,
  CONSTRAINT pagamentos_faturaId_fkey
    FOREIGN KEY ("faturaId")     REFERENCES faturas(id)     ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS pagamentos_usuarioId_idx  ON pagamentos("usuarioId");
CREATE INDEX IF NOT EXISTS pagamentos_status_idx     ON pagamentos(status);
CREATE INDEX IF NOT EXISTS pagamentos_tipo_idx       ON pagamentos(tipo);
CREATE INDEX IF NOT EXISTS pagamentos_mpPaymentId_idx ON pagamentos("mpPaymentId");

CREATE TRIGGER update_pagamentos_updated_at
  BEFORE UPDATE ON pagamentos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================
-- chaves_pix
-- =====================================================================
CREATE TABLE IF NOT EXISTS chaves_pix (
  id            TEXT        NOT NULL DEFAULT ('c' || encode(gen_random_bytes(12), 'hex')),
  tipo          TEXT        NOT NULL,
  chave         TEXT        NOT NULL,
  titular       TEXT        NOT NULL,
  ativa         BOOLEAN     NOT NULL DEFAULT true,
  "usuarioId"   TEXT        NOT NULL,
  "criadoEm"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT chaves_pix_pkey        PRIMARY KEY (id),
  CONSTRAINT chaves_pix_usuarioId_fkey
    FOREIGN KEY ("usuarioId") REFERENCES usuarios(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS chaves_pix_usuarioId_idx ON chaves_pix("usuarioId");

CREATE TRIGGER update_chaves_pix_updated_at
  BEFORE UPDATE ON chaves_pix
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================
-- saques
-- =====================================================================
CREATE TABLE IF NOT EXISTS saques (
  id            TEXT        NOT NULL DEFAULT ('c' || encode(gen_random_bytes(12), 'hex')),
  valor         INTEGER     NOT NULL,
  status        TEXT        NOT NULL DEFAULT 'SOLICITADO',
  "mpPayoutId"  TEXT,
  "designerId"  TEXT        NOT NULL,
  "chavePixId"  TEXT        NOT NULL,
  "criadoEm"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT saques_pkey           PRIMARY KEY (id),
  CONSTRAINT saques_mpPayoutId_key UNIQUE ("mpPayoutId"),
  CONSTRAINT saques_designerId_fkey
    FOREIGN KEY ("designerId") REFERENCES usuarios(id)   ON DELETE RESTRICT,
  CONSTRAINT saques_chavePixId_fkey
    FOREIGN KEY ("chavePixId") REFERENCES chaves_pix(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS saques_designerId_idx ON saques("designerId");
CREATE INDEX IF NOT EXISTS saques_status_idx     ON saques(status);

CREATE TRIGGER update_saques_updated_at
  BEFORE UPDATE ON saques
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================
-- aceites_contratuais
-- =====================================================================
CREATE TABLE IF NOT EXISTS aceites_contratuais (
  id           TEXT        NOT NULL DEFAULT ('c' || encode(gen_random_bytes(12), 'hex')),
  "termoVersao" TEXT       NOT NULL DEFAULT '1.0',
  ip           TEXT,
  "userAgent"  TEXT,
  "usuarioId"  TEXT        NOT NULL,
  "projetoId"  TEXT        NOT NULL,
  "criadoEm"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT aceites_contratuais_pkey             PRIMARY KEY (id),
  CONSTRAINT aceites_contratuais_usuarioId_projetoId_key UNIQUE ("usuarioId", "projetoId"),
  CONSTRAINT aceites_contratuais_usuarioId_fkey
    FOREIGN KEY ("usuarioId") REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT aceites_contratuais_projetoId_fkey
    FOREIGN KEY ("projetoId") REFERENCES projetos(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS aceites_contratuais_usuarioId_idx ON aceites_contratuais("usuarioId");
CREATE INDEX IF NOT EXISTS aceites_contratuais_projetoId_idx ON aceites_contratuais("projetoId");

-- =====================================================================
-- disputas
-- =====================================================================
CREATE TABLE IF NOT EXISTS disputas (
  id              TEXT        NOT NULL DEFAULT ('c' || encode(gen_random_bytes(12), 'hex')),
  tipo            TEXT        NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'ABERTA',
  descricao       TEXT        NOT NULL,
  resolucao       TEXT,
  "saldoBloqueado" INTEGER    NOT NULL DEFAULT 0,
  "resolvidaEm"   TIMESTAMP(3),
  "abertaPorId"   TEXT        NOT NULL,
  "projetoId"     TEXT        NOT NULL,
  "faturaId"      TEXT,
  "criadoEm"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT disputas_pkey          PRIMARY KEY (id),
  CONSTRAINT disputas_abertaPorId_fkey
    FOREIGN KEY ("abertaPorId") REFERENCES usuarios(id) ON DELETE RESTRICT,
  CONSTRAINT disputas_projetoId_fkey
    FOREIGN KEY ("projetoId")   REFERENCES projetos(id) ON DELETE RESTRICT,
  CONSTRAINT disputas_faturaId_fkey
    FOREIGN KEY ("faturaId")    REFERENCES faturas(id)  ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS disputas_projetoId_idx  ON disputas("projetoId");
CREATE INDEX IF NOT EXISTS disputas_abertaPorId_idx ON disputas("abertaPorId");
CREATE INDEX IF NOT EXISTS disputas_status_idx     ON disputas(status);

CREATE TRIGGER update_disputas_updated_at
  BEFORE UPDATE ON disputas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================
-- Seed: usuário admin padrão
-- Senha: Admin@123456 — trocar imediatamente em produção!
-- =====================================================================
INSERT INTO usuarios (email, senha, nome, tipo, ativo, "emailVerificado")
VALUES (
  'admin@viu.app',
  '$2a$10$XQ6l6vYCZE4h5z5Eg5xDWuqK7BpPqZH1qJ0xUYBGYQOYPZXVZQUzC',
  'Admin VIU',
  'ADMIN',
  true,
  true
)
ON CONFLICT (email) DO NOTHING;
