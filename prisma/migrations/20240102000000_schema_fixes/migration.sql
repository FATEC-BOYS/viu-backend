-- Migration: schema_fixes
-- 1. Arte.tamanho Int → BigInt (evita overflow em arquivos > 2 GB)
ALTER TABLE "artes" ALTER COLUMN "tamanho" TYPE BIGINT;

-- 2. LinkCompartilhado.criadorId (rastrear quem criou o link)
ALTER TABLE "link_compartilhado" ADD COLUMN "criador_id" TEXT;
ALTER TABLE "link_compartilhado"
  ADD CONSTRAINT "link_compartilhado_criador_id_fkey"
  FOREIGN KEY ("criador_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "link_compartilhado_criador_id_idx" ON "link_compartilhado"("criador_id");

-- 3. ChavePix @@unique([usuarioId, chave]) (impede duplicatas por usuário)
ALTER TABLE "chaves_pix"
  ADD CONSTRAINT "chaves_pix_usuario_id_chave_key" UNIQUE ("usuario_id", "chave");
