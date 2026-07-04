-- Versionamento de Arte
CREATE TABLE "arte_versoes" (
  "id"          TEXT NOT NULL DEFAULT ('c' || encode(gen_random_bytes(12), 'hex')),
  "numero"      INTEGER NOT NULL,
  "arquivo"     TEXT NOT NULL,
  "tipo"        TEXT NOT NULL,
  "tamanho"     BIGINT NOT NULL,
  "descricao"   TEXT,
  "criadoEm"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "arteId"      TEXT NOT NULL,
  "criadoPorId" TEXT NOT NULL,
  CONSTRAINT "arte_versoes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "arte_versoes_arteId_idx" ON "arte_versoes"("arteId");

ALTER TABLE "arte_versoes"
  ADD CONSTRAINT "arte_versoes_arteId_fkey"
    FOREIGN KEY ("arteId") REFERENCES "artes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "arte_versoes"
  ADD CONSTRAINT "arte_versoes_criadoPorId_fkey"
    FOREIGN KEY ("criadoPorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- GIN indexes para full-text search em português
-- Usam expressão to_tsvector para cobrir nome + descricao em um único índice
CREATE INDEX "projetos_fts_idx" ON "projetos" USING GIN (
  to_tsvector('portuguese', COALESCE(nome, '') || ' ' || COALESCE(descricao, ''))
);

CREATE INDEX "artes_fts_idx" ON "artes" USING GIN (
  to_tsvector('portuguese', COALESCE(nome, '') || ' ' || COALESCE(descricao, ''))
);
