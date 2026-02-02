-- ================================================
-- VIU BACKEND - SUPABASE SCHEMA
-- ================================================
-- Execute este script no Supabase SQL Editor
-- Dashboard > SQL Editor > New query > Cole e Execute
-- ================================================

-- Habilitar extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ================================================
-- TABELA: usuarios
-- ================================================
CREATE TABLE IF NOT EXISTS usuarios (
  id TEXT PRIMARY KEY DEFAULT ('c' || encode(gen_random_bytes(12), 'hex')),
  email TEXT UNIQUE NOT NULL,
  senha TEXT NOT NULL,
  nome TEXT NOT NULL,
  telefone TEXT,
  avatar TEXT,
  tipo TEXT DEFAULT 'DESIGNER' NOT NULL,
  ativo BOOLEAN DEFAULT true NOT NULL,

  -- 2FA
  "twoFactorEnabled" BOOLEAN DEFAULT false NOT NULL,
  "twoFactorSecret" TEXT,
  "twoFactorBackupCodes" TEXT[] DEFAULT '{}',

  -- Timestamps
  "criadoEm" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "atualizadoEm" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Índices para usuarios
CREATE INDEX IF NOT EXISTS "usuarios_email_idx" ON usuarios(email);
CREATE INDEX IF NOT EXISTS "usuarios_tipo_idx" ON usuarios(tipo);
CREATE INDEX IF NOT EXISTS "usuarios_ativo_idx" ON usuarios(ativo);
CREATE INDEX IF NOT EXISTS "usuarios_criadoEm_idx" ON usuarios("criadoEm");

-- Trigger para atualizar atualizadoEm
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW."atualizadoEm" = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_usuarios_updated_at BEFORE UPDATE ON usuarios
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ================================================
-- TABELA: projetos
-- ================================================
CREATE TABLE IF NOT EXISTS projetos (
  id TEXT PRIMARY KEY DEFAULT ('c' || encode(gen_random_bytes(12), 'hex')),
  nome TEXT NOT NULL,
  descricao TEXT,
  status TEXT DEFAULT 'EM_ANDAMENTO' NOT NULL,
  orcamento INTEGER,
  prazo TIMESTAMP(3),

  "designerId" TEXT NOT NULL,
  "clienteId" TEXT NOT NULL,

  "criadoEm" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "atualizadoEm" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,

  CONSTRAINT "projetos_designerId_fkey" FOREIGN KEY ("designerId") REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "projetos_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "projetos_designerId_idx" ON projetos("designerId");
CREATE INDEX IF NOT EXISTS "projetos_clienteId_idx" ON projetos("clienteId");
CREATE INDEX IF NOT EXISTS "projetos_status_idx" ON projetos(status);
CREATE INDEX IF NOT EXISTS "projetos_criadoEm_idx" ON projetos("criadoEm");

CREATE TRIGGER update_projetos_updated_at BEFORE UPDATE ON projetos
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ================================================
-- TABELA: artes
-- ================================================
CREATE TABLE IF NOT EXISTS artes (
  id TEXT PRIMARY KEY DEFAULT ('c' || encode(gen_random_bytes(12), 'hex')),
  nome TEXT NOT NULL,
  descricao TEXT,
  arquivo TEXT NOT NULL,
  tipo TEXT NOT NULL,
  tamanho INTEGER NOT NULL,
  versao INTEGER DEFAULT 1 NOT NULL,
  status TEXT DEFAULT 'EM_ANALISE' NOT NULL,

  "projetoId" TEXT NOT NULL,
  "autorId" TEXT NOT NULL,

  "criadoEm" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "atualizadoEm" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,

  CONSTRAINT "artes_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES projetos(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "artes_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "artes_projetoId_idx" ON artes("projetoId");
CREATE INDEX IF NOT EXISTS "artes_autorId_idx" ON artes("autorId");
CREATE INDEX IF NOT EXISTS "artes_status_idx" ON artes(status);
CREATE INDEX IF NOT EXISTS "artes_tipo_idx" ON artes(tipo);
CREATE INDEX IF NOT EXISTS "artes_criadoEm_idx" ON artes("criadoEm");

CREATE TRIGGER update_artes_updated_at BEFORE UPDATE ON artes
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ================================================
-- TABELA: feedbacks
-- ================================================
CREATE TABLE IF NOT EXISTS feedbacks (
  id TEXT PRIMARY KEY DEFAULT ('c' || encode(gen_random_bytes(12), 'hex')),
  conteudo TEXT NOT NULL,
  tipo TEXT DEFAULT 'TEXTO' NOT NULL,
  arquivo TEXT,
  "posicaoX" DOUBLE PRECISION,
  "posicaoY" DOUBLE PRECISION,

  transcricao TEXT,
  "audioGerado" TEXT,

  "arteId" TEXT NOT NULL,
  "autorId" TEXT NOT NULL,

  "criadoEm" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,

  CONSTRAINT "feedbacks_arteId_fkey" FOREIGN KEY ("arteId") REFERENCES artes(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "feedbacks_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "feedbacks_arteId_idx" ON feedbacks("arteId");
CREATE INDEX IF NOT EXISTS "feedbacks_autorId_idx" ON feedbacks("autorId");
CREATE INDEX IF NOT EXISTS "feedbacks_tipo_idx" ON feedbacks(tipo);
CREATE INDEX IF NOT EXISTS "feedbacks_criadoEm_idx" ON feedbacks("criadoEm");

-- ================================================
-- TABELA: aprovacoes
-- ================================================
CREATE TABLE IF NOT EXISTS aprovacoes (
  id TEXT PRIMARY KEY DEFAULT ('c' || encode(gen_random_bytes(12), 'hex')),
  status TEXT DEFAULT 'PENDENTE' NOT NULL,
  comentario TEXT,

  "arteId" TEXT NOT NULL,
  "aprovadorId" TEXT NOT NULL,

  "criadoEm" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,

  CONSTRAINT "aprovacoes_arteId_fkey" FOREIGN KEY ("arteId") REFERENCES artes(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "aprovacoes_aprovadorId_fkey" FOREIGN KEY ("aprovadorId") REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "aprovacoes_arteId_idx" ON aprovacoes("arteId");
CREATE INDEX IF NOT EXISTS "aprovacoes_aprovadorId_idx" ON aprovacoes("aprovadorId");
CREATE INDEX IF NOT EXISTS "aprovacoes_status_idx" ON aprovacoes(status);
CREATE INDEX IF NOT EXISTS "aprovacoes_criadoEm_idx" ON aprovacoes("criadoEm");

-- ================================================
-- TABELA: tarefas
-- ================================================
CREATE TABLE IF NOT EXISTS tarefas (
  id TEXT PRIMARY KEY DEFAULT ('c' || encode(gen_random_bytes(12), 'hex')),
  titulo TEXT NOT NULL,
  descricao TEXT,
  status TEXT DEFAULT 'PENDENTE' NOT NULL,
  prioridade TEXT DEFAULT 'MEDIA' NOT NULL,
  prazo TIMESTAMP(3),

  "projetoId" TEXT,
  "responsavelId" TEXT NOT NULL,

  "criadoEm" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "atualizadoEm" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,

  CONSTRAINT "tarefas_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES projetos(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "tarefas_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "tarefas_projetoId_idx" ON tarefas("projetoId");
CREATE INDEX IF NOT EXISTS "tarefas_responsavelId_idx" ON tarefas("responsavelId");
CREATE INDEX IF NOT EXISTS "tarefas_status_idx" ON tarefas(status);
CREATE INDEX IF NOT EXISTS "tarefas_prioridade_idx" ON tarefas(prioridade);
CREATE INDEX IF NOT EXISTS "tarefas_prazo_idx" ON tarefas(prazo);

CREATE TRIGGER update_tarefas_updated_at BEFORE UPDATE ON tarefas
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ================================================
-- TABELA: notificacoes
-- ================================================
CREATE TABLE IF NOT EXISTS notificacoes (
  id TEXT PRIMARY KEY DEFAULT ('c' || encode(gen_random_bytes(12), 'hex')),
  titulo TEXT NOT NULL,
  conteudo TEXT NOT NULL,
  tipo TEXT NOT NULL,
  canal TEXT DEFAULT 'SISTEMA' NOT NULL,
  lida BOOLEAN DEFAULT false NOT NULL,

  "usuarioId" TEXT NOT NULL,

  "criadoEm" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,

  CONSTRAINT "notificacoes_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES usuarios(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "notificacoes_usuarioId_idx" ON notificacoes("usuarioId");
CREATE INDEX IF NOT EXISTS "notificacoes_tipo_idx" ON notificacoes(tipo);
CREATE INDEX IF NOT EXISTS "notificacoes_lida_idx" ON notificacoes(lida);
CREATE INDEX IF NOT EXISTS "notificacoes_criadoEm_idx" ON notificacoes("criadoEm");

-- ================================================
-- TABELA: sessoes
-- ================================================
CREATE TABLE IF NOT EXISTS sessoes (
  id TEXT PRIMARY KEY DEFAULT ('c' || encode(gen_random_bytes(12), 'hex')),
  token TEXT UNIQUE NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  ativo BOOLEAN DEFAULT true NOT NULL,

  "usuarioId" TEXT NOT NULL,

  "criadoEm" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,

  CONSTRAINT "sessoes_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES usuarios(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "sessoes_usuarioId_idx" ON sessoes("usuarioId");
CREATE INDEX IF NOT EXISTS "sessoes_token_idx" ON sessoes(token);
CREATE INDEX IF NOT EXISTS "sessoes_expiresAt_idx" ON sessoes("expiresAt");
CREATE INDEX IF NOT EXISTS "sessoes_ativo_idx" ON sessoes(ativo);

-- ================================================
-- TABELA: audit_logs
-- ================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY DEFAULT ('c' || encode(gen_random_bytes(12), 'hex')),
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  "resourceId" TEXT,

  details JSONB,
  "ipAddress" TEXT,
  "userAgent" TEXT,

  status TEXT NOT NULL,
  "errorMessage" TEXT,

  "usuarioId" TEXT,

  "criadoEm" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,

  CONSTRAINT "audit_logs_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "audit_logs_usuarioId_idx" ON audit_logs("usuarioId");
CREATE INDEX IF NOT EXISTS "audit_logs_action_idx" ON audit_logs(action);
CREATE INDEX IF NOT EXISTS "audit_logs_resource_idx" ON audit_logs(resource);
CREATE INDEX IF NOT EXISTS "audit_logs_status_idx" ON audit_logs(status);
CREATE INDEX IF NOT EXISTS "audit_logs_criadoEm_idx" ON audit_logs("criadoEm");

-- ================================================
-- TABELA: security_events
-- ================================================
CREATE TABLE IF NOT EXISTS security_events (
  id TEXT PRIMARY KEY DEFAULT ('c' || encode(gen_random_bytes(12), 'hex')),
  "eventType" TEXT NOT NULL,
  severity TEXT NOT NULL,

  description TEXT NOT NULL,
  details JSONB,

  "ipAddress" TEXT,
  "userAgent" TEXT,
  location TEXT,

  "usuarioId" TEXT,

  resolved BOOLEAN DEFAULT false NOT NULL,
  "resolvedAt" TIMESTAMP(3),
  "resolvedBy" TEXT,

  "criadoEm" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,

  CONSTRAINT "security_events_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "security_events_usuarioId_idx" ON security_events("usuarioId");
CREATE INDEX IF NOT EXISTS "security_events_eventType_idx" ON security_events("eventType");
CREATE INDEX IF NOT EXISTS "security_events_severity_idx" ON security_events(severity);
CREATE INDEX IF NOT EXISTS "security_events_resolved_idx" ON security_events(resolved);
CREATE INDEX IF NOT EXISTS "security_events_criadoEm_idx" ON security_events("criadoEm");

-- ================================================
-- INSERIR USUÁRIO ADMIN DE TESTE
-- ================================================
-- Senha: Admin@123456 (bcrypt hash)
-- IMPORTANTE: Mudar senha em produção!
INSERT INTO usuarios (id, email, senha, nome, tipo, ativo)
VALUES (
  'c' || encode(gen_random_bytes(12), 'hex'),
  'admin@viu.com',
  '$2a$10$XQ6l6vYCZE4h5z5Eg5xDWuqK7BpPqZH1qJ0xUYBGYQOYPZXVZQUzC',
  'Admin VIU',
  'ADMIN',
  true
)
ON CONFLICT (email) DO NOTHING;

-- ================================================
-- FINALIZADO!
-- ================================================
-- Agora você pode:
-- 1. Copiar a connection string do Supabase
-- 2. Atualizar seu .env
-- 3. Rodar: npm run db:generate && npm run db:push
-- ================================================
