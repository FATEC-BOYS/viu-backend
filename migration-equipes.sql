-- =====================================================
-- Migration: Adiciona modelo Equipe e EquipeMembro
-- Execute no SQL Editor do Supabase
-- =====================================================

-- 1. Tabela de equipes
CREATE TABLE IF NOT EXISTS public.equipes (
  id            TEXT        NOT NULL DEFAULT ('c' || encode(gen_random_bytes(12), 'hex')),
  nome          TEXT        NOT NULL,
  slug          TEXT        NOT NULL,
  "donoPrincipalId" TEXT   NOT NULL,
  "criadoEm"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT equipes_pkey PRIMARY KEY (id),
  CONSTRAINT equipes_slug_key UNIQUE (slug)
);

-- 2. Tabela de membros de equipe
CREATE TABLE IF NOT EXISTS public.equipe_membros (
  "equipeId"  TEXT        NOT NULL,
  "usuarioId" TEXT        NOT NULL,
  papel       TEXT        NOT NULL,
  "criadoEm"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT equipe_membros_pkey PRIMARY KEY ("equipeId", "usuarioId")
);

-- 3. Adiciona coluna equipeId em projetos (nullable — migração não-destrutiva)
ALTER TABLE public.projetos
  ADD COLUMN IF NOT EXISTS "equipeId" TEXT;

-- 4. Foreign keys
ALTER TABLE public.equipes
  ADD CONSTRAINT equipes_donoPrincipalId_fkey
  FOREIGN KEY ("donoPrincipalId") REFERENCES public.usuarios(id)
  ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE public.equipe_membros
  ADD CONSTRAINT equipe_membros_equipeId_fkey
  FOREIGN KEY ("equipeId") REFERENCES public.equipes(id)
  ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE public.equipe_membros
  ADD CONSTRAINT equipe_membros_usuarioId_fkey
  FOREIGN KEY ("usuarioId") REFERENCES public.usuarios(id)
  ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE public.projetos
  ADD CONSTRAINT projetos_equipeId_fkey
  FOREIGN KEY ("equipeId") REFERENCES public.equipes(id)
  ON UPDATE CASCADE ON DELETE SET NULL;

-- 5. Índices
CREATE INDEX IF NOT EXISTS equipes_donoPrincipalId_idx ON public.equipes("donoPrincipalId");
CREATE INDEX IF NOT EXISTS equipes_slug_idx             ON public.equipes(slug);
CREATE INDEX IF NOT EXISTS equipe_membros_usuarioId_idx ON public.equipe_membros("usuarioId");
CREATE INDEX IF NOT EXISTS projetos_equipeId_idx        ON public.projetos("equipeId");

-- 6. Trigger para atualizar atualizadoEm automaticamente
CREATE OR REPLACE FUNCTION update_equipes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW."atualizadoEm" = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS equipes_set_updated_at ON public.equipes;
CREATE TRIGGER equipes_set_updated_at
  BEFORE UPDATE ON public.equipes
  FOR EACH ROW EXECUTE FUNCTION update_equipes_updated_at();
