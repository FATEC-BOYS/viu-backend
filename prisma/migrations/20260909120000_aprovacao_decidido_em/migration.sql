-- AlterTable
ALTER TABLE "aprovacoes" ADD COLUMN     "decididoEm" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "aprovacoes_decididoEm_idx" ON "aprovacoes"("decididoEm");

