-- Uma fatura pode ter mais de uma tentativa de pagamento.
--
-- `faturaId` era UNIQUE, então a primeira tentativa era a única possível. QR
-- expirado (webhook do MP: cancelled) ou pagamento recusado (rejected) deixava
-- a tentativa morta e a fatura PENDENTE, sem caminho de volta: o cliente ficava
-- impedido de pagar para sempre.
--
-- DROP CONSTRAINT e não DROP INDEX: o `@unique` do Prisma cria uma constraint,
-- e o índice que a sustenta não pode ser removido sozinho (Postgres 2BP01).
ALTER TABLE "pagamentos" DROP CONSTRAINT IF EXISTS "pagamentos_faturaId_key";
CREATE INDEX "pagamentos_faturaId_idx" ON "pagamentos"("faturaId");

-- Quando o QR deixa de valer, como o gateway informou. Antes era recalculado
-- como `agora + 24h` a cada resposta, inclusive ao reexpor um QR antigo.
ALTER TABLE "pagamentos" ADD COLUMN "expiraEm" TIMESTAMP(3);
