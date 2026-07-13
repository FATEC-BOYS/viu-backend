-- CreateTable
CREATE TABLE "whatsapp_envios" (
    "id" TEXT NOT NULL DEFAULT 'c' || encode(gen_random_bytes(12), 'hex'),
    "telefone" TEXT NOT NULL,
    "waMessageId" TEXT,
    "tipo" TEXT NOT NULL DEFAULT 'SOLICITACAO_APROVACAO',
    "status" TEXT NOT NULL DEFAULT 'AGUARDANDO_RESPOSTA',
    "respostaTipo" TEXT,
    "respostaConteudo" TEXT,
    "respostaEm" TIMESTAMP(3),
    "erro" TEXT,
    "arteId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_envios_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_envios_waMessageId_key" ON "whatsapp_envios"("waMessageId");

-- CreateIndex
CREATE INDEX "whatsapp_envios_telefone_status_idx" ON "whatsapp_envios"("telefone", "status");

-- CreateIndex
CREATE INDEX "whatsapp_envios_arteId_idx" ON "whatsapp_envios"("arteId");

-- CreateIndex
CREATE INDEX "whatsapp_envios_clienteId_idx" ON "whatsapp_envios"("clienteId");

-- CreateIndex
CREATE INDEX "whatsapp_envios_status_idx" ON "whatsapp_envios"("status");

-- AddForeignKey
ALTER TABLE "whatsapp_envios" ADD CONSTRAINT "whatsapp_envios_arteId_fkey" FOREIGN KEY ("arteId") REFERENCES "artes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_envios" ADD CONSTRAINT "whatsapp_envios_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

