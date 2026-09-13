-- Os três planos de designer, com as taxas que a plataforma cobra.
--
-- Isto é dado de referência, não fixture de desenvolvimento: `src/database/seed.ts`
-- apaga tudo antes de popular e nunca roda em produção. Aqui entra por migration
-- porque `npm start` roda `prisma migrate deploy` — é o único caminho que garante
-- que os planos existam no ambiente onde a fatura é calculada.
--
-- Sem nenhuma linha em `planos`, `faturaService` caía numa constante do código
-- (`TAXA_PADRAO = 0.10`) em TODA fatura, e a tela de administração de planos
-- mostrava uma lista vazia sobre a qual não dava para decidir nada.
--
-- Os limites do Gratuito são os mesmos tetos de beta de `requirePlanLimit`
-- (BETA_MAX_PROJETOS=3, BETA_MAX_ARTES=20). Deixá-los nulos seria pior do que
-- não ter plano nenhum: nulo significa ILIMITADO no middleware, então assinar o
-- plano grátis afrouxaria o teto de quem não assina nada.
--
-- Os pagos ficam com limite nulo de propósito — plano pago sem teto é decisão de
-- produto. `limitesStorageMb` fica nulo nos três porque nada no código o lê
-- ainda; preenchê-lo seria anunciar um limite que não é aplicado.
--
-- `WHERE NOT EXISTS` pelo nome: se alguém já tiver cadastrado um destes pela
-- tela de administração, esta migration não duplica.

INSERT INTO "planos" ("nome", "tipo", "precoMensal", "precoAnual", "taxaPlataforma", "limitesProjetos", "limitesArtes", "limitesStorageMb", "descricao", "ativo")
SELECT 'Gratuito', 'DESIGNER', 0, NULL, 0.10, 3, 20, NULL,
       'Para começar. A plataforma retém 10% de cada fatura paga.', true
WHERE NOT EXISTS (SELECT 1 FROM "planos" WHERE "nome" = 'Gratuito' AND "tipo" = 'DESIGNER');

INSERT INTO "planos" ("nome", "tipo", "precoMensal", "precoAnual", "taxaPlataforma", "limitesProjetos", "limitesArtes", "limitesStorageMb", "descricao", "ativo")
SELECT 'Profissional', 'DESIGNER', 4900, NULL, 0.05, NULL, NULL, NULL,
       'Projetos e artes sem limite. A plataforma retém 5% de cada fatura paga.', true
WHERE NOT EXISTS (SELECT 1 FROM "planos" WHERE "nome" = 'Profissional' AND "tipo" = 'DESIGNER');

INSERT INTO "planos" ("nome", "tipo", "precoMensal", "precoAnual", "taxaPlataforma", "limitesProjetos", "limitesArtes", "limitesStorageMb", "descricao", "ativo")
SELECT 'Estúdio', 'DESIGNER', 14900, NULL, 0.02, NULL, NULL, NULL,
       'Para quem fatura alto. A plataforma retém 2% de cada fatura paga.', true
WHERE NOT EXISTS (SELECT 1 FROM "planos" WHERE "nome" = 'Estúdio' AND "tipo" = 'DESIGNER');
