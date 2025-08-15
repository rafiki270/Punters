#!/bin/sh
set -e

# Ensure DB directory exists (for SQLite persistence)
mkdir -p /data

# Ensure Prisma schema is applied to the SQLite DB (no migrations required)
if [ -f "/app/prisma/schema.prisma" ]; then
  echo "[entrypoint] Applying Prisma schema to database..."
  npx prisma db push --accept-data-loss >/dev/null 2>&1 || true
fi

echo "[entrypoint] Starting server on port ${PORT:-80}"
exec node dist/server.js
