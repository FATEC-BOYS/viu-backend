#!/usr/bin/env bash
# Sobe um Postgres efêmero e roda os testes de concorrência contra ele.
#
# Existe porque o mock do Prisma não tem isolamento: `$transaction` do
# criarPrismaMock só chama o callback com o próprio proxy, então SERIALIZABLE,
# conflito e P2034 simplesmente não acontecem ali. Um teste verde no mock diz
# que a aritmética do saldo está certa e nada sobre concorrência — e é
# concorrência que impede saque duplo.
#
# Uso: npm run test:db
# No CI, DATABASE_URL já vem do serviço postgres e o cluster local é pulado.
set -euo pipefail

PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PGTMP="${PGTMP:-/tmp/viu-pg-test}"
PGPORT="${PGPORT:-55432}"

encerrar() {
  if [ -n "${SUBIMOS_CLUSTER:-}" ]; then
    ${COMO_PG:-} "$PGBIN/pg_ctl" -D "$PGTMP/data" -m immediate stop >/dev/null 2>&1 || true
    rm -rf "$PGTMP"
  fi
}
trap encerrar EXIT

if [ -z "${DATABASE_URL_TESTE:-}" ]; then
  if [ ! -x "$PGBIN/initdb" ]; then
    echo "PostgreSQL não encontrado em $PGBIN — defina PGBIN ou DATABASE_URL_TESTE." >&2
    exit 1
  fi

  echo "→ subindo Postgres efêmero na porta $PGPORT"
  rm -rf "$PGTMP"
  mkdir -p "$PGTMP/data"

  # O Postgres recusa rodar como root. Em container (CI, sandbox) somos root,
  # então o cluster sobe sob o usuário `postgres`; fora disso roda direto.
  if [ "$(id -u)" = "0" ]; then
    chown -R postgres:postgres "$PGTMP"
    COMO_PG="setpriv --reuid=postgres --regid=postgres --clear-groups"
  else
    COMO_PG=""
  fi

  $COMO_PG "$PGBIN/initdb" -D "$PGTMP/data" -U postgres --auth=trust >/dev/null
  # -k aponta o socket para o diretório temporário: sem isso colide com o
  # socket do Postgres do sistema, quando existe um.
  $COMO_PG "$PGBIN/pg_ctl" -D "$PGTMP/data" -o "-p $PGPORT -k $PGTMP" -l "$PGTMP/log" start >/dev/null
  SUBIMOS_CLUSTER=1

  $COMO_PG "$PGBIN/createdb" -h 127.0.0.1 -p "$PGPORT" -U postgres viu_teste
  export DATABASE_URL_TESTE="postgresql://postgres@127.0.0.1:$PGPORT/viu_teste"
fi

echo "→ aplicando migrações"
DATABASE_URL="$DATABASE_URL_TESTE" npx prisma migrate deploy >/dev/null

echo "→ rodando testes de concorrência"
DATABASE_URL="$DATABASE_URL_TESTE" npx vitest run --config vitest.db.config.ts
