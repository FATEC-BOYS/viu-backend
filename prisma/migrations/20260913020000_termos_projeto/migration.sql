-- Os termos comerciais de cada projeto: o que o anexo de revisão renderiza.
--
-- Tabela separada de `projetos`, e não colunas novas lá, porque um aditivo
-- precisa congelar exatamente este conjunto e comparar duas versões dele.
-- Com um objeto coeso isso é um diff; com colunas espalhadas, conferência
-- manual.
--
-- Todo campo é anulável porque o projeto nasce antes de alguém combinar os
-- termos. Quem decide se está completo é `termosCompletos()`, no código, em um
-- lugar só — o aviso da fatura e o portão leem a mesma função.
--
-- Sem CHECK para os pares (licencaPrazo='ATE_DATA' exige licencaPrazoAte;
-- exclusividade=true exige exclusividadeAte): aqui não há corrida entre duas
-- requisições, é um formulário, então a validação do zod basta. Isto é
-- diferente do índice de fatura, onde a garantia precisava ser do banco porque
-- duas requisições simultâneas passavam pela checagem da aplicação.

-- CreateTable
CREATE TABLE "termos_projeto" (
    "id" TEXT NOT NULL DEFAULT ('c'::text || encode(gen_random_bytes(12), 'hex'::text)),
    "projetoId" TEXT NOT NULL,
    "rodadasIncluidas" INTEGER,
    "prazoRevisaoDiasUteis" INTEGER,
    "licencaFinalidade" TEXT,
    "licencaTerritorio" TEXT,
    "licencaPrazo" TEXT,
    "licencaPrazoAte" TIMESTAMP(3),
    "exclusividade" BOOLEAN,
    "exclusividadeAte" TIMESTAMP(3),
    "arquivosFonte" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "termos_projeto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "termos_projeto_projetoId_key" ON "termos_projeto"("projetoId");

-- AddForeignKey
ALTER TABLE "termos_projeto" ADD CONSTRAINT "termos_projeto_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projetos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

