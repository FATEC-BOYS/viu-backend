-- Soft delete for Aprovacao (contractual evidence, never hard-deleted)
ALTER TABLE "aprovacoes" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE INDEX "aprovacoes_deletedAt_idx" ON "aprovacoes"("deletedAt");

-- EquipeConvite: team-level invite flow (mirrors convites_projeto)
CREATE TABLE "equipe_convites" (
    "id"             TEXT NOT NULL DEFAULT ('c' || encode(gen_random_bytes(12), 'hex')),
    "tokenHash"      TEXT NOT NULL,
    "status"         TEXT NOT NULL DEFAULT 'PENDENTE',
    "papel"          TEXT NOT NULL,
    "expiraEm"       TIMESTAMP(3) NOT NULL,
    "equipeId"       TEXT NOT NULL,
    "convidadoId"    TEXT NOT NULL,
    "convidadoPorId" TEXT NOT NULL,
    "criadoEm"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondidoEm"   TIMESTAMP(3),

    CONSTRAINT "equipe_convites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "equipe_convites_tokenHash_key" ON "equipe_convites"("tokenHash");
CREATE INDEX "equipe_convites_equipeId_idx"    ON "equipe_convites"("equipeId");
CREATE INDEX "equipe_convites_convidadoId_idx" ON "equipe_convites"("convidadoId");
CREATE INDEX "equipe_convites_status_idx"      ON "equipe_convites"("status");

ALTER TABLE "equipe_convites"
    ADD CONSTRAINT "equipe_convites_equipeId_fkey"
        FOREIGN KEY ("equipeId") REFERENCES "equipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "equipe_convites"
    ADD CONSTRAINT "equipe_convites_convidadoId_fkey"
        FOREIGN KEY ("convidadoId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "equipe_convites"
    ADD CONSTRAINT "equipe_convites_convidadoPorId_fkey"
        FOREIGN KEY ("convidadoPorId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
