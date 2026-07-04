-- CreateTable: ConviteProjeto
CREATE TABLE "convites_projeto" (
    "id"              TEXT NOT NULL DEFAULT ('c' || encode(gen_random_bytes(12), 'hex')),
    "token_hash"      TEXT NOT NULL,
    "status"          TEXT NOT NULL DEFAULT 'PENDENTE',
    "expira_em"       TIMESTAMP(3) NOT NULL,
    "projeto_id"      TEXT NOT NULL,
    "convidado_id"    TEXT NOT NULL,
    "convidado_por_id" TEXT NOT NULL,
    "criado_em"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondido_em"   TIMESTAMP(3),

    CONSTRAINT "convites_projeto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "convites_projeto_token_hash_key" ON "convites_projeto"("token_hash");
CREATE INDEX "convites_projeto_projeto_id_idx" ON "convites_projeto"("projeto_id");
CREATE INDEX "convites_projeto_convidado_id_idx" ON "convites_projeto"("convidado_id");
CREATE INDEX "convites_projeto_status_idx" ON "convites_projeto"("status");

-- AddForeignKey
ALTER TABLE "convites_projeto" ADD CONSTRAINT "convites_projeto_projeto_id_fkey"
    FOREIGN KEY ("projeto_id") REFERENCES "projetos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "convites_projeto" ADD CONSTRAINT "convites_projeto_convidado_id_fkey"
    FOREIGN KEY ("convidado_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "convites_projeto" ADD CONSTRAINT "convites_projeto_convidado_por_id_fkey"
    FOREIGN KEY ("convidado_por_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
