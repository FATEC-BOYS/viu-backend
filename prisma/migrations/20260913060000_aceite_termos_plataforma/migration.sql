-- O aceite dos termos da plataforma ganha tabela própria.
--
-- Até aqui o produto gravava "fulano aceitou os termos" em `aceites_contratuais`
-- no momento da criação do projeto, com `termoVersao = '1.0'` apontando para um
-- documento que não existia em lugar nenhum: dava para provar o clique e não o
-- que a pessoa leu. E no momento errado, porque o que rege escopo, rodadas e
-- propriedade intelectual é o anexo do projeto, que nem existe quando o projeto
-- é criado.
--
-- Tabela separada, e não uma coluna a mais na outra: `aceites_contratuais` exige
-- `projetoId`, e os termos da plataforma não têm projeto — reger a relação com o
-- VIU é o que eles fazem. Reaproveitar a tabela reproduziria a confusão que esta
-- migration desfaz.
--
-- Aditiva: nada é apagado. As linhas legadas continuam onde estão, com o que
-- sempre significaram — "alguém clicou em aceitar, em tal data, deste IP".

-- CreateTable
CREATE TABLE "aceites_termos" (
    "id" TEXT NOT NULL DEFAULT ('c'::text || encode(gen_random_bytes(12), 'hex'::text)),
    "versao" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "usuarioId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aceites_termos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "aceites_termos_usuarioId_idx" ON "aceites_termos"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "aceites_termos_usuarioId_versao_key" ON "aceites_termos"("usuarioId", "versao");

-- AddForeignKey
ALTER TABLE "aceites_termos" ADD CONSTRAINT "aceites_termos_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

