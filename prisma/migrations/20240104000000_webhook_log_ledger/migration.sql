-- CreateTable: ledger_entries (audit trail imutável de débitos e créditos por designer)
CREATE TABLE "ledger_entries" (
    "id"         TEXT NOT NULL DEFAULT ('c' || encode(gen_random_bytes(12), 'hex')),
    "tipo"       TEXT NOT NULL,
    "valor"      INTEGER NOT NULL,
    "descricao"  TEXT NOT NULL,
    "referencia" TEXT,
    "designerId" TEXT NOT NULL,
    "criadoEm"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable: webhook_logs (deduplicação e auditoria de eventos do gateway)
CREATE TABLE "webhook_logs" (
    "id"           TEXT NOT NULL DEFAULT ('c' || encode(gen_random_bytes(12), 'hex')),
    "externalId"   TEXT NOT NULL,
    "tipo"         TEXT NOT NULL,
    "status"       TEXT NOT NULL DEFAULT 'RECEBIDO',
    "payload"      JSONB NOT NULL,
    "tentativas"   INTEGER NOT NULL DEFAULT 0,
    "erro"         TEXT,
    "processadoEm" TIMESTAMP(3),
    "criadoEm"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ledger_entries_designerId_idx" ON "ledger_entries"("designerId");
CREATE INDEX "ledger_entries_tipo_idx"       ON "ledger_entries"("tipo");
CREATE INDEX "ledger_entries_criadoEm_idx"   ON "ledger_entries"("criadoEm");

CREATE UNIQUE INDEX "webhook_logs_externalId_key" ON "webhook_logs"("externalId");
CREATE INDEX "webhook_logs_status_idx"   ON "webhook_logs"("status");
CREATE INDEX "webhook_logs_criadoEm_idx" ON "webhook_logs"("criadoEm");

-- AddForeignKey
ALTER TABLE "ledger_entries"
    ADD CONSTRAINT "ledger_entries_designerId_fkey"
    FOREIGN KEY ("designerId") REFERENCES "usuarios"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
