-- ========================================
-- MIGRATION: Sincronizar Schema Prisma com Supabase
-- ========================================
-- Este script cria/atualiza todas as tabelas e relacionamentos
-- para resolver os erros de relacionamento no frontend

-- ========================================
-- 1. REMOVER TABELAS EXISTENTES (se necessário)
-- ========================================
-- ATENÇÃO: Isso vai apagar todos os dados!
-- Comente estas linhas se quiser preservar dados existentes

DROP TABLE IF EXISTS public.link_compartilhado CASCADE;
DROP TABLE IF EXISTS public.security_events CASCADE;
DROP TABLE IF EXISTS public.audit_logs CASCADE;
DROP TABLE IF EXISTS public.sessoes CASCADE;
DROP TABLE IF EXISTS public.notificacoes CASCADE;
DROP TABLE IF EXISTS public.tarefas CASCADE;
DROP TABLE IF EXISTS public.aprovacoes CASCADE;
DROP TABLE IF EXISTS public.feedbacks CASCADE;
DROP TABLE IF EXISTS public.artes CASCADE;
DROP TABLE IF EXISTS public.projetos CASCADE;
DROP TABLE IF EXISTS public.usuarios CASCADE;
DROP TABLE IF EXISTS public.usuario_auth CASCADE;

-- ========================================
-- 2. CRIAR TABELA DE USUÁRIOS
-- ========================================
CREATE TABLE public.usuarios (
  id TEXT NOT NULL DEFAULT ('c' || encode(gen_random_bytes(12), 'hex')),
  email TEXT NOT NULL,
  senha TEXT, -- Opcional para login social
  nome TEXT NOT NULL,
  telefone TEXT,
  avatar TEXT,
  tipo TEXT NOT NULL DEFAULT 'DESIGNER',
  ativo BOOLEAN NOT NULL DEFAULT true,
  "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
  "twoFactorSecret" TEXT,
  "twoFactorBackupCodes" TEXT[] DEFAULT '{}',
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT usuarios_pkey PRIMARY KEY (id),
  CONSTRAINT usuarios_email_key UNIQUE (email)
);

-- Índices para performance
CREATE INDEX usuarios_email_idx ON public.usuarios(email);
CREATE INDEX usuarios_tipo_idx ON public.usuarios(tipo);
CREATE INDEX usuarios_ativo_idx ON public.usuarios(ativo);
CREATE INDEX usuarios_criadoEm_idx ON public.usuarios("criadoEm");

-- ========================================
-- 3. CRIAR TABELA DE PROJETOS
-- ========================================
CREATE TABLE public.projetos (
  id TEXT NOT NULL DEFAULT ('c' || encode(gen_random_bytes(12), 'hex')),
  nome TEXT NOT NULL,
  descricao TEXT,
  status TEXT NOT NULL DEFAULT 'EM_ANDAMENTO',
  orcamento INTEGER,
  prazo TIMESTAMP(3),
  "designerId" TEXT NOT NULL,
  "clienteId" TEXT NOT NULL,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT projetos_pkey PRIMARY KEY (id),
  CONSTRAINT projetos_designerId_fkey FOREIGN KEY ("designerId") 
    REFERENCES public.usuarios(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT projetos_clienteId_fkey FOREIGN KEY ("clienteId") 
    REFERENCES public.usuarios(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Índices
CREATE INDEX projetos_designerId_idx ON public.projetos("designerId");
CREATE INDEX projetos_clienteId_idx ON public.projetos("clienteId");
CREATE INDEX projetos_status_idx ON public.projetos(status);
CREATE INDEX projetos_criadoEm_idx ON public.projetos("criadoEm");

-- ========================================
-- 4. CRIAR TABELA DE ARTES
-- ========================================
CREATE TABLE public.artes (
  id TEXT NOT NULL DEFAULT ('c' || encode(gen_random_bytes(12), 'hex')),
  nome TEXT NOT NULL,
  descricao TEXT,
  arquivo TEXT NOT NULL,
  tipo TEXT NOT NULL,
  tamanho INTEGER NOT NULL,
  versao INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'EM_ANALISE',
  "projetoId" TEXT NOT NULL,
  "autorId" TEXT NOT NULL,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT artes_pkey PRIMARY KEY (id),
  CONSTRAINT artes_projetoId_fkey FOREIGN KEY ("projetoId") 
    REFERENCES public.projetos(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT artes_autorId_fkey FOREIGN KEY ("autorId") 
    REFERENCES public.usuarios(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Índices
CREATE INDEX artes_projetoId_idx ON public.artes("projetoId");
CREATE INDEX artes_autorId_idx ON public.artes("autorId");
CREATE INDEX artes_status_idx ON public.artes(status);
CREATE INDEX artes_tipo_idx ON public.artes(tipo);
CREATE INDEX artes_criadoEm_idx ON public.artes("criadoEm");

-- ========================================
-- 5. CRIAR TABELA DE FEEDBACKS
-- ========================================
CREATE TABLE public.feedbacks (
  id TEXT NOT NULL DEFAULT ('c' || encode(gen_random_bytes(12), 'hex')),
  conteudo TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'TEXTO',
  arquivo TEXT,
  "posicaoX" DOUBLE PRECISION,
  "posicaoY" DOUBLE PRECISION,
  transcricao TEXT,
  "audioGerado" TEXT,
  "arteId" TEXT NOT NULL,
  "autorId" TEXT NOT NULL,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT feedbacks_pkey PRIMARY KEY (id),
  CONSTRAINT feedbacks_arteId_fkey FOREIGN KEY ("arteId") 
    REFERENCES public.artes(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT feedbacks_autorId_fkey FOREIGN KEY ("autorId") 
    REFERENCES public.usuarios(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Índices
CREATE INDEX feedbacks_arteId_idx ON public.feedbacks("arteId");
CREATE INDEX feedbacks_autorId_idx ON public.feedbacks("autorId");
CREATE INDEX feedbacks_tipo_idx ON public.feedbacks(tipo);
CREATE INDEX feedbacks_criadoEm_idx ON public.feedbacks("criadoEm");

-- ========================================
-- 6. CRIAR TABELA DE APROVAÇÕES
-- ========================================
CREATE TABLE public.aprovacoes (
  id TEXT NOT NULL DEFAULT ('c' || encode(gen_random_bytes(12), 'hex')),
  status TEXT NOT NULL DEFAULT 'PENDENTE',
  comentario TEXT,
  "arteId" TEXT NOT NULL,
  "aprovadorId" TEXT NOT NULL,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT aprovacoes_pkey PRIMARY KEY (id),
  CONSTRAINT aprovacoes_arteId_fkey FOREIGN KEY ("arteId") 
    REFERENCES public.artes(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT aprovacoes_aprovadorId_fkey FOREIGN KEY ("aprovadorId") 
    REFERENCES public.usuarios(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Índices
CREATE INDEX aprovacoes_arteId_idx ON public.aprovacoes("arteId");
CREATE INDEX aprovacoes_aprovadorId_idx ON public.aprovacoes("aprovadorId");
CREATE INDEX aprovacoes_status_idx ON public.aprovacoes(status);
CREATE INDEX aprovacoes_criadoEm_idx ON public.aprovacoes("criadoEm");

-- ========================================
-- 7. CRIAR TABELA DE TAREFAS
-- ========================================
CREATE TABLE public.tarefas (
  id TEXT NOT NULL DEFAULT ('c' || encode(gen_random_bytes(12), 'hex')),
  titulo TEXT NOT NULL,
  descricao TEXT,
  status TEXT NOT NULL DEFAULT 'PENDENTE',
  prioridade TEXT NOT NULL DEFAULT 'MEDIA',
  prazo TIMESTAMP(3),
  "projetoId" TEXT,
  "responsavelId" TEXT NOT NULL,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT tarefas_pkey PRIMARY KEY (id),
  CONSTRAINT tarefas_projetoId_fkey FOREIGN KEY ("projetoId") 
    REFERENCES public.projetos(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT tarefas_responsavelId_fkey FOREIGN KEY ("responsavelId") 
    REFERENCES public.usuarios(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Índices
CREATE INDEX tarefas_projetoId_idx ON public.tarefas("projetoId");
CREATE INDEX tarefas_responsavelId_idx ON public.tarefas("responsavelId");
CREATE INDEX tarefas_status_idx ON public.tarefas(status);
CREATE INDEX tarefas_prioridade_idx ON public.tarefas(prioridade);
CREATE INDEX tarefas_prazo_idx ON public.tarefas(prazo);

-- ========================================
-- 8. CRIAR TABELA DE NOTIFICAÇÕES
-- ========================================
CREATE TABLE public.notificacoes (
  id TEXT NOT NULL DEFAULT ('c' || encode(gen_random_bytes(12), 'hex')),
  titulo TEXT NOT NULL,
  conteudo TEXT NOT NULL,
  tipo TEXT NOT NULL,
  canal TEXT NOT NULL DEFAULT 'SISTEMA',
  lida BOOLEAN NOT NULL DEFAULT false,
  "usuarioId" TEXT NOT NULL,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT notificacoes_pkey PRIMARY KEY (id),
  CONSTRAINT notificacoes_usuarioId_fkey FOREIGN KEY ("usuarioId") 
    REFERENCES public.usuarios(id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- Índices
CREATE INDEX notificacoes_usuarioId_idx ON public.notificacoes("usuarioId");
CREATE INDEX notificacoes_tipo_idx ON public.notificacoes(tipo);
CREATE INDEX notificacoes_lida_idx ON public.notificacoes(lida);
CREATE INDEX notificacoes_criadoEm_idx ON public.notificacoes("criadoEm");

-- ========================================
-- 9. CRIAR TABELA DE SESSÕES
-- ========================================
CREATE TABLE public.sessoes (
  id TEXT NOT NULL DEFAULT ('c' || encode(gen_random_bytes(12), 'hex')),
  token TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  "usuarioId" TEXT NOT NULL,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT sessoes_pkey PRIMARY KEY (id),
  CONSTRAINT sessoes_token_key UNIQUE (token),
  CONSTRAINT sessoes_usuarioId_fkey FOREIGN KEY ("usuarioId") 
    REFERENCES public.usuarios(id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- Índices
CREATE INDEX sessoes_usuarioId_idx ON public.sessoes("usuarioId");
CREATE INDEX sessoes_token_idx ON public.sessoes(token);
CREATE INDEX sessoes_expiresAt_idx ON public.sessoes("expiresAt");
CREATE INDEX sessoes_ativo_idx ON public.sessoes(ativo);

-- ========================================
-- 10. CRIAR TABELA DE AUDIT LOGS
-- ========================================
CREATE TABLE public.audit_logs (
  id TEXT NOT NULL DEFAULT ('c' || encode(gen_random_bytes(12), 'hex')),
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  "resourceId" TEXT,
  details JSONB,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  status TEXT NOT NULL,
  "errorMessage" TEXT,
  "usuarioId" TEXT,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT audit_logs_pkey PRIMARY KEY (id),
  CONSTRAINT audit_logs_usuarioId_fkey FOREIGN KEY ("usuarioId") 
    REFERENCES public.usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE
);

-- Índices
CREATE INDEX audit_logs_usuarioId_idx ON public.audit_logs("usuarioId");
CREATE INDEX audit_logs_action_idx ON public.audit_logs(action);
CREATE INDEX audit_logs_resource_idx ON public.audit_logs(resource);
CREATE INDEX audit_logs_status_idx ON public.audit_logs(status);
CREATE INDEX audit_logs_criadoEm_idx ON public.audit_logs("criadoEm");

-- ========================================
-- 11. CRIAR TABELA DE SECURITY EVENTS
-- ========================================
CREATE TABLE public.security_events (
  id TEXT NOT NULL DEFAULT ('c' || encode(gen_random_bytes(12), 'hex')),
  "eventType" TEXT NOT NULL,
  severity TEXT NOT NULL,
  description TEXT NOT NULL,
  details JSONB,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  location TEXT,
  "usuarioId" TEXT,
  resolved BOOLEAN NOT NULL DEFAULT false,
  "resolvedAt" TIMESTAMP(3),
  "resolvedBy" TEXT,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT security_events_pkey PRIMARY KEY (id),
  CONSTRAINT security_events_usuarioId_fkey FOREIGN KEY ("usuarioId") 
    REFERENCES public.usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE
);

-- Índices
CREATE INDEX security_events_usuarioId_idx ON public.security_events("usuarioId");
CREATE INDEX security_events_eventType_idx ON public.security_events("eventType");
CREATE INDEX security_events_severity_idx ON public.security_events(severity);
CREATE INDEX security_events_resolved_idx ON public.security_events(resolved);
CREATE INDEX security_events_criadoEm_idx ON public.security_events("criadoEm");

-- ========================================
-- 12. CRIAR TABELA DE LINKS COMPARTILHADOS
-- ========================================
CREATE TABLE public.link_compartilhado (
  id TEXT NOT NULL DEFAULT ('c' || encode(gen_random_bytes(12), 'hex')),
  token TEXT NOT NULL,
  tipo TEXT NOT NULL,
  "arteId" TEXT,
  "somenteLeitura" BOOLEAN NOT NULL DEFAULT true,
  "expiraEm" TIMESTAMP(3),
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT link_compartilhado_pkey PRIMARY KEY (id),
  CONSTRAINT link_compartilhado_token_key UNIQUE (token),
  CONSTRAINT link_compartilhado_arteId_fkey FOREIGN KEY ("arteId") 
    REFERENCES public.artes(id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- Índices
CREATE INDEX link_compartilhado_token_idx ON public.link_compartilhado(token);
CREATE INDEX link_compartilhado_arteId_idx ON public.link_compartilhado("arteId");
CREATE INDEX link_compartilhado_expiraEm_idx ON public.link_compartilhado("expiraEm");

-- ========================================
-- 13. HABILITAR ROW LEVEL SECURITY (RLS)
-- ========================================
-- Importante para segurança no Supabase

ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projetos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedbacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aprovacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarefas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.link_compartilhado ENABLE ROW LEVEL SECURITY;

-- ========================================
-- 14. POLÍTICAS RLS BÁSICAS (Temporárias - Ajuste conforme necessário)
-- ========================================
-- ATENÇÃO: Estas políticas permitem acesso total para usuários autenticados
-- Você deve ajustá-las conforme suas regras de negócio

-- Usuários: podem ver e atualizar apenas seu próprio perfil
CREATE POLICY "Usuários podem ver seu próprio perfil" 
  ON public.usuarios FOR SELECT 
  USING (auth.uid()::text = id OR auth.role() = 'service_role');

CREATE POLICY "Usuários podem atualizar seu próprio perfil" 
  ON public.usuarios FOR UPDATE 
  USING (auth.uid()::text = id OR auth.role() = 'service_role');

-- Projetos: designers e clientes podem ver seus projetos
CREATE POLICY "Usuários podem ver seus projetos" 
  ON public.projetos FOR SELECT 
  USING (auth.uid()::text = "designerId" OR auth.uid()::text = "clienteId" OR auth.role() = 'service_role');

CREATE POLICY "Designers podem criar projetos" 
  ON public.projetos FOR INSERT 
  WITH CHECK (auth.uid()::text = "designerId" OR auth.role() = 'service_role');

CREATE POLICY "Designers podem atualizar seus projetos" 
  ON public.projetos FOR UPDATE 
  USING (auth.uid()::text = "designerId" OR auth.role() = 'service_role');

-- Artes: membros do projeto podem ver
CREATE POLICY "Membros do projeto podem ver artes" 
  ON public.artes FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM public.projetos 
      WHERE projetos.id = artes."projetoId" 
      AND (projetos."designerId" = auth.uid()::text OR projetos."clienteId" = auth.uid()::text)
    ) OR auth.role() = 'service_role'
  );

CREATE POLICY "Autores podem criar artes" 
  ON public.artes FOR INSERT 
  WITH CHECK (auth.uid()::text = "autorId" OR auth.role() = 'service_role');

-- Feedbacks: membros do projeto podem ver e criar
CREATE POLICY "Membros do projeto podem ver feedbacks" 
  ON public.feedbacks FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM public.artes 
      JOIN public.projetos ON artes."projetoId" = projetos.id
      WHERE artes.id = feedbacks."arteId" 
      AND (projetos."designerId" = auth.uid()::text OR projetos."clienteId" = auth.uid()::text)
    ) OR auth.role() = 'service_role'
  );

CREATE POLICY "Usuários autenticados podem criar feedbacks" 
  ON public.feedbacks FOR INSERT 
  WITH CHECK (auth.uid()::text = "autorId" OR auth.role() = 'service_role');

-- Notificações: usuários podem ver apenas suas notificações
CREATE POLICY "Usuários podem ver suas notificações" 
  ON public.notificacoes FOR SELECT 
  USING (auth.uid()::text = "usuarioId" OR auth.role() = 'service_role');

CREATE POLICY "Sistema pode criar notificações" 
  ON public.notificacoes FOR INSERT 
  WITH CHECK (auth.role() = 'service_role');

-- Políticas permissivas temporárias para outras tabelas (ajuste conforme necessário)
CREATE POLICY "Service role tem acesso total" 
  ON public.aprovacoes FOR ALL 
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role tem acesso total tarefas" 
  ON public.tarefas FOR ALL 
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role tem acesso total sessoes" 
  ON public.sessoes FOR ALL 
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role tem acesso total audit_logs" 
  ON public.audit_logs FOR ALL 
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role tem acesso total security_events" 
  ON public.security_events FOR ALL 
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role tem acesso total link_compartilhado" 
  ON public.link_compartilhado FOR ALL 
  USING (auth.role() = 'service_role');

-- ========================================
-- FIM DA MIGRATION
-- ========================================
