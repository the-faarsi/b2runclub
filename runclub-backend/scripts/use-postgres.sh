#!/usr/bin/env bash
#
# Switches this backend from SQLite to Postgres (Supabase).
#
# Two things have to change together, and changing only one produces a confusing
# failure at deploy time rather than here:
#
#   1. prisma/schema.prisma      provider "sqlite" -> "postgresql"
#   2. prisma/migrations/0_init  the SQLite CREATE TABLEs -> the Postgres ones
#
# The migration matters because `npm start` runs `prisma migrate deploy`. Left as
# SQLite SQL it would be replayed against Postgres and fail partway through,
# leaving a half-built database.
#
# This is one-way for the running app: after this, `file:./dev.db` no longer
# works, so your local setup and any SQLite deployment need the Postgres URL too.
# Nothing is deleted — dev.db is left alone and git has the previous version.

set -euo pipefail
cd "$(dirname "$0")/.."

SCHEMA="prisma/schema.prisma"
PG_SQL="prisma/postgres/init.sql"
MIGRATION="prisma/migrations/0_init/migration.sql"

if ! grep -q 'provider = "sqlite"' "$SCHEMA"; then
    echo "  Schema is already not SQLite — nothing to do."
    exit 0
fi

if [ ! -s "$PG_SQL" ]; then
    echo "  Missing $PG_SQL. Regenerate it with:"
    echo "    sed 's/provider *= *\"sqlite\"/provider = \"postgresql\"/' $SCHEMA > /tmp/pg.prisma"
    echo "    npx prisma migrate diff --from-empty --to-schema /tmp/pg.prisma --script > $PG_SQL"
    exit 1
fi

cp "$SCHEMA" "$SCHEMA.sqlite.bak"
cp "$MIGRATION" "$MIGRATION.sqlite.bak"

sed -i.tmp 's/provider = "sqlite"/provider = "postgresql"/' "$SCHEMA" && rm -f "$SCHEMA.tmp"
cp "$PG_SQL" "$MIGRATION"

echo "  ✓ $SCHEMA        provider -> postgresql"
echo "  ✓ $MIGRATION     -> Postgres SQL ($(grep -c 'CREATE TABLE' "$MIGRATION") tables)"
echo "    backups: *.sqlite.bak"
echo
echo "  Next:"
echo "    1. set DATABASE_URL to the Supabase POOLER url (port 6543)"
echo "    2. set DIRECT_URL   to the Supabase DIRECT url (port 5432)"
echo "    3. npx prisma generate"
