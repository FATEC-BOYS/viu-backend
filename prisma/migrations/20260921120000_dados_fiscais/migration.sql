-- Os dados que uma nota fiscal precisa de quem a recebe.
--
-- Reexecutável de ponta a ponta, como toda migração desde a que morreu pela
-- metade em produção e travou os deploys seguintes com P3009. `migrate deploy`
-- não reverte o que já aplicou: se esta quebrasse no meio, a tentativa
-- seguinte esbarraria em "relation already exists" e a recuperação viraria
-- trabalho manual no banco.

CREATE TABLE IF NOT EXISTS "dados_fiscais" (
    "id" TEXT NOT NULL DEFAULT ('c'::text || encode(gen_random_bytes(12), 'hex'::text)),
    "tipoPessoa" TEXT NOT NULL,
    "documento" TEXT NOT NULL,
    "razaoSocial" TEXT NOT NULL,
    "nomeFantasia" TEXT,
    "inscricaoMunicipal" TEXT,
    "cep" TEXT NOT NULL,
    "logradouro" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "complemento" TEXT,
    "bairro" TEXT NOT NULL,
    "cidade" TEXT NOT NULL,
    "uf" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dados_fiscais_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "dados_fiscais_usuarioId_key" ON "dados_fiscais"("usuarioId");

CREATE INDEX IF NOT EXISTS "dados_fiscais_documento_idx" ON "dados_fiscais"("documento");

-- Postgres não tem `ADD CONSTRAINT IF NOT EXISTS`, então o par drop-then-add é
-- o que torna esta linha repetível. O `IF EXISTS` do drop cobre a primeira
-- execução, em que a constraint ainda não existe.
ALTER TABLE "dados_fiscais" DROP CONSTRAINT IF EXISTS "dados_fiscais_usuarioId_fkey";
ALTER TABLE "dados_fiscais" ADD CONSTRAINT "dados_fiscais_usuarioId_fkey"
    FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
