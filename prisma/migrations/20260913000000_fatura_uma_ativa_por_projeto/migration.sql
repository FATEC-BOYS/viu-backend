-- Uma fatura ativa por projeto, garantida pelo banco.
--
-- A regra já existia em `faturaService.criarFatura`, mas como
-- verifica-depois-insere: um `findFirst` e, se não achasse nada, um `create`.
-- Duas requisições simultâneas leem "não existe" as duas e inserem as duas —
-- toque duplo no celular, retry depois de uma resposta perdida, duas abas.
--
-- O estrago não para em dois registros: cada fatura tem id próprio, e o id é a
-- chave de idempotência no Mercado Pago (`fatura-${faturaId}`). Duas faturas =
-- dois QR codes válidos para o mesmo trabalho, e o cliente pode pagar os dois.
--
-- Parcial de propósito: refaturar depois de cancelar é legítimo, então várias
-- CANCELADA/ESTORNADA continuam permitidas no mesmo projeto. O que não pode é
-- mais de uma cobrável.
--
-- Se esta migração falhar com "could not create unique index", o banco JÁ tem
-- duplicatas e elas precisam de decisão humana — são dinheiro, não dá para o
-- script escolher qual apagar. Para encontrá-las:
--
--   SELECT "projetoId", count(*), array_agg(id)
--   FROM faturas WHERE status IN ('PENDENTE','PAGA')
--   GROUP BY "projetoId" HAVING count(*) > 1;
CREATE UNIQUE INDEX "faturas_uma_ativa_por_projeto"
  ON "faturas" ("projetoId")
  WHERE status IN ('PENDENTE', 'PAGA');
