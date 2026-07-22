#!/bin/sh
set -e

echo "🚀 Starting Anzaro AI..."

# ── Wait for PostgreSQL to be ready ──────────────────────────────
# DATABASE_URL must be set in the environment (e.g., via HF Spaces Secrets)
# Format: postgresql://USER:PASSWORD@HOST:5432/DATABASE

if [ -z "$DATABASE_URL" ]; then
  echo "❌ DATABASE_URL environment variable is not set!"
  echo "   Set it to a PostgreSQL connection string, e.g.:"
  echo "   postgresql://user:pass@host:5432/dbname"
  exit 1
fi

echo "⏳ Waiting for PostgreSQL to be ready..."
# Extract host from DATABASE_URL for health check
PG_HOST=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:\/]*\).*/\1/p')
PG_PORT=$(echo "$DATABASE_URL" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')

if [ -n "$PG_HOST" ] && [ -n "$PG_PORT" ]; then
  MAX_RETRIES=30
  RETRY_COUNT=0
  while ! pg_isready -h "$PG_HOST" -p "$PG_PORT" -q 2>/dev/null; do
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
      echo "⚠️  PostgreSQL not ready after $MAX_RETRIES retries, continuing anyway..."
      break
    fi
    echo "   PostgreSQL not ready yet (attempt $RETRY_COUNT/$MAX_RETRIES)..."
    sleep 2
  done
  if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
    echo "✅ PostgreSQL is ready!"
  fi
else
  echo "⚠️  Could not parse DATABASE_URL for health check, skipping..."
fi

# ── Run database migrations ──────────────────────────────────────
echo "📦 Running database migrations..."
node ./node_modules/prisma/build/index.js migrate deploy 2>&1 || {
  echo "⚠️  Prisma migrate deploy failed, retrying..."
  sleep 3
  node ./node_modules/prisma/build/index.js migrate deploy 2>&1 || {
    echo "❌ Migration failed. Check DATABASE_URL and PostgreSQL connectivity."
    exit 1
  }
}

# Seed the database (create admin user + default settings)
echo "🌱 Seeding database..."
node seed.js 2>&1 || echo "⚠️  Seed failed, but continuing..."

# Start the Next.js server
echo "🌐 Starting server..."
exec node server.js
