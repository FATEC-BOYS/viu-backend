-- Destino da notificação: sem isto a caixa de entrada avisa e abandona.
-- Anulável porque mensagem de sistema não aponta para nada e porque as linhas
-- que já existem nasceram sem destino.
ALTER TABLE "notificacoes" ADD COLUMN IF NOT EXISTS "entidadeTipo" TEXT;
ALTER TABLE "notificacoes" ADD COLUMN IF NOT EXISTS "entidadeId" TEXT;

-- Listagem é sempre "as minhas, da mais nova para a mais velha", com desempate
-- por id para a paginação não repetir nem pular linha.
CREATE INDEX IF NOT EXISTS "notificacoes_usuarioId_criadoEm_id_idx" ON "notificacoes"("usuarioId", "criadoEm", "id");
