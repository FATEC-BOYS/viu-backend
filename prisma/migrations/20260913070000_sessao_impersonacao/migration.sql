-- A sessão passa a saber quando é uma impersonação.
--
-- `impersonadoPorId` preenchido significa: `usuarioId` é de quem está sendo
-- visto, e esta coluna diz qual admin está dentro. Nulo é sessão comum, que é
-- o que toda linha existente continua sendo.
--
-- A coluna é a FONTE DA VERDADE do estado, e não uma claim no JWT. Com a claim,
-- revogar a impersonação no banco não teria efeito enquanto o token não
-- expirasse — e duas fontes para o mesmo fato acabam discordando. `authenticate`
-- já lê a linha da sessão a cada requisição, então ler mais uma coluna não
-- custa consulta nenhuma.
--
-- Aditiva e anulável: nada precisa ser preenchido para trás.

-- AlterTable
ALTER TABLE "sessoes" ADD COLUMN     "impersonadoPorId" TEXT;

-- CreateIndex
CREATE INDEX "sessoes_impersonadoPorId_idx" ON "sessoes"("impersonadoPorId");

-- AddForeignKey
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_impersonadoPorId_fkey" FOREIGN KEY ("impersonadoPorId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

