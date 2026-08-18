-- CreateTable
CREATE TABLE "vinculos_cliente" (
    "id" TEXT NOT NULL DEFAULT ('c'::text || encode(gen_random_bytes(12), 'hex'::text)),
    "designerId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "rompidoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vinculos_cliente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vinculos_cliente_designerId_idx" ON "vinculos_cliente"("designerId");

-- CreateIndex
CREATE INDEX "vinculos_cliente_clienteId_idx" ON "vinculos_cliente"("clienteId");

-- CreateIndex
CREATE INDEX "vinculos_cliente_rompidoEm_idx" ON "vinculos_cliente"("rompidoEm");

-- CreateIndex
CREATE UNIQUE INDEX "vinculos_cliente_designerId_clienteId_key" ON "vinculos_cliente"("designerId", "clienteId");

-- AddForeignKey
ALTER TABLE "vinculos_cliente" ADD CONSTRAINT "vinculos_cliente_designerId_fkey" FOREIGN KEY ("designerId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vinculos_cliente" ADD CONSTRAINT "vinculos_cliente_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

