-- O anexo de revisão congelado, e o aceite deixando de apagar o próprio
-- histórico.
--
-- ═══ O que havia ═══
--
-- `aceites_contratuais` guardava `termoVersao` — um rótulo tipo "1.0" apontando
-- para um documento que não existia em lugar nenhum. Dava para provar "João
-- aceitou a versão 1.0 em tal data, deste IP" e não dava para provar O QUE a
-- versão 1.0 dizia. Numa disputa isso vale zero: a defesa é "não foi isso que
-- combinei" e não há nada que contradiga.
--
-- Pior: `registrarAceite` era `upsert` com `update`. Aceitar uma redação nova
-- SOBRESCREVIA a linha anterior — trocava termoVersao, ip e userAgent — e a
-- prova do aceite anterior deixava de existir. É o oposto do que uma trilha de
-- prova precisa ser.
--
-- ═══ O que entra ═══
--
-- `contratos_projeto` guarda o texto literal que as partes leram, mais o
-- sha256 dele. Nada nessa linha muda depois de criada: um aditivo não altera a
-- versão vigente, cria a seguinte, e a anterior fica SUBSTITUIDA com os aceites
-- dela intactos.
--
-- `dados` (JSONB) guarda tudo que o template consumiu para produzir o texto —
-- partes, projeto e termos, congelados. `Usuario.nome` muda; o contrato não.
-- É também o que permite comparar duas versões num aditivo sem interpretar
-- prosa.
--
-- ═══ Sobre a unicidade ═══
--
-- `[usuarioId, projetoId]` vira `[usuarioId, contratoId]`: cada versão guarda o
-- próprio aceite. `contratoId` é anulável por causa do legado, e no Postgres
-- NULLs são distintos entre si num índice único — então linhas antigas, todas
-- com contratoId nulo, não colidem entre si. É o comportamento desejado: elas
-- são aceites de um texto que não foi preservado, e nulo diz exatamente isso.
--
-- Nenhuma coluna é removida: `projetoId` e `termoVersao` ficam para as linhas
-- que já dependiam deles.

-- DropIndex
--
-- `prisma migrate diff` emitiu `DROP INDEX` aqui e o Postgres recusa (2BP01):
-- no baseline esta unicidade nasceu como CONSTRAINT inline na criação da
-- tabela, e índice que sustenta constraint só cai junto com ela. Trocado à mão
-- pelo `DROP CONSTRAINT`, que é o que o próprio erro sugere.
ALTER TABLE "aceites_contratuais"
  DROP CONSTRAINT "aceites_contratuais_usuarioId_projetoId_key";

-- AlterTable
ALTER TABLE "aceites_contratuais" ADD COLUMN     "contratoId" TEXT,
ADD COLUMN     "hashAceito" TEXT,
ADD COLUMN     "papel" TEXT;

-- CreateTable
CREATE TABLE "contratos_projeto" (
    "id" TEXT NOT NULL DEFAULT ('c'::text || encode(gen_random_bytes(12), 'hex'::text)),
    "projetoId" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'VIGENTE',
    "texto" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "dados" JSONB NOT NULL,
    "templateVersao" TEXT NOT NULL,
    "revisadoJuridicamente" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contratos_projeto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contratos_projeto_projetoId_status_idx" ON "contratos_projeto"("projetoId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "contratos_projeto_projetoId_versao_key" ON "contratos_projeto"("projetoId", "versao");

-- CreateIndex
CREATE INDEX "aceites_contratuais_contratoId_idx" ON "aceites_contratuais"("contratoId");

-- CreateIndex
CREATE UNIQUE INDEX "aceites_contratuais_usuarioId_contratoId_key" ON "aceites_contratuais"("usuarioId", "contratoId");

-- AddForeignKey
ALTER TABLE "contratos_projeto" ADD CONSTRAINT "contratos_projeto_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projetos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aceites_contratuais" ADD CONSTRAINT "aceites_contratuais_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "contratos_projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

