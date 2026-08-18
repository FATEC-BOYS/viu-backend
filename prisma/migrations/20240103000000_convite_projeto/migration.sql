-- CreateTable: ConviteProjeto
CREATE TABLE "convites_projeto" (
    "id"             TEXT NOT NULL DEFAULT ('c' || encode(gen_random_bytes(12), 'hex')),
    "tokenHash"      TEXT NOT NULL,
    "status"         TEXT NOT NULL DEFAULT 'PENDENTE',
    "expiraEm"       TIMESTAMP(3) NOT NULL,
    "projetoId"      TEXT NOT NULL,
    "convidadoId"    TEXT NOT NULL,
    "convidadoPorId" TEXT NOT NULL,
    "criadoEm"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondidoEm"   TIMESTAMP(3),

    CONSTRAINT "convites_projeto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "convites_projeto_tokenHash_key" ON "convites_projeto"("tokenHash");
CREATE INDEX "convites_projeto_projetoId_idx" ON "convites_projeto"("projetoId");
CREATE INDEX "convites_projeto_convidadoId_idx" ON "convites_projeto"("convidadoId");
CREATE INDEX "convites_projeto_status_idx" ON "convites_projeto"("status");

-- AddForeignKey
ALTER TABLE "convites_projeto" ADD CONSTRAINT "convites_projeto_projetoId_fkey"
    FOREIGN KEY ("projetoId") REFERENCES "projetos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "convites_projeto" ADD CONSTRAINT "convites_projeto_convidadoId_fkey"
    FOREIGN KEY ("convidadoId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "convites_projeto" ADD CONSTRAINT "convites_projeto_convidadoPorId_fkey"
    FOREIGN KEY ("convidadoPorId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
