-- Repara apenas decisões inequívocas do cliente principal sobre a versão atual.
-- Não inventa datas, não altera decisões e não aplica aprovação antiga à versão nova.
WITH decisoes AS (
  SELECT a.id, MIN(ap.status) AS status
  FROM artes a
  JOIN projetos p ON p.id = a."projetoId"
  JOIN aprovacoes ap ON ap."arteId" = a.id AND ap."aprovadorId" = p."clienteId"
  WHERE ap."deletedAt" IS NULL
    AND COALESCE(ap."versaoNumero", 1) = a.versao
  GROUP BY a.id
  HAVING COUNT(*) = 1 AND MIN(ap.status) IN ('APROVADO', 'REJEITADO')
)
UPDATE artes a SET status = d.status
FROM decisoes d WHERE a.id = d.id AND a.status = 'EM_ANALISE';
