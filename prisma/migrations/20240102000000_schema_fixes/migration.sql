-- Migration: schema_fixes
-- 1. Arte.tamanho Int → BigInt (evita overflow em arquivos > 2 GB)
ALTER TABLE "artes" ALTER COLUMN "tamanho" TYPE BIGINT;

-- 2. LinkCompartilhado.criadorId (rastrear quem criou o link)
ALTER TABLE "link_compartilhado" ADD COLUMN "criadorId" TEXT;
ALTER TABLE "link_compartilhado"
  ADD CONSTRAINT "link_compartilhado_criadorId_fkey"
  FOREIGN KEY ("criadorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "link_compartilhado_criadorId_idx" ON "link_compartilhado"("criadorId");

-- 3. ChavePix @@unique([usuarioId, chave]) (impede duplicatas por usuário)
ALTER TABLE "chaves_pix"
  ADD CONSTRAINT "chaves_pix_usuarioId_chave_key" UNIQUE ("usuarioId", "chave");
