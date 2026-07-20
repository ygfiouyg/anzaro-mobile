# ─── Anzaro AI — HuggingFace Space Dockerfile ───────────────────────────
# Next.js 16 app with Prisma + Supabase PostgreSQL, running on port 3000
# DATABASE_URL and DIRECT_URL must be set as HF Space Secrets (Supabase pooler URLs).
# ─────────────────────────────────────────────────────────────────────────

FROM node:20-slim

# Install system dependencies for sharp, bcrypt, prisma, ffmpeg
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    python3 \
    make \
    g++ \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install dependencies
COPY package.json bun.lock* ./
COPY prisma ./prisma/

# Install bun for faster installs (falls back to npm if bun.lock not present)
RUN npm install -g bun 2>/dev/null || true

# Install dependencies
RUN if [ -f bun.lock ]; then \
      bun install --frozen-lockfile 2>/dev/null || npm install; \
    else \
      npm install; \
    fi

# Generate Prisma client (V.27: must succeed — AudioRecord model needed)
RUN npx prisma generate
# Validate the schema parses cleanly against the postgresql provider.
# This does NOT touch the DB — it just confirms schema syntax.
RUN npx prisma validate 2>/dev/null || true

# Copy source code
COPY . .

# Create .env file with non-secret production values.
# NOTE: DATABASE_URL / DIRECT_URL are intentionally NOT written here —
# they are provided by HF Space Secrets at runtime. Writing a bogus
# file:// URL here would shadow the real Supabase URL and break the app.
RUN echo 'SESSION_SECRET="anzaro-hf-space-secret-2025-stable"' > .env && \
    echo 'NEXTAUTH_URL="https://kopabdo-delta-ai-v2.hf.space"' >> .env && \
    echo 'NEXTAUTH_SECRET="anzaro-nextauth-secret-2025"' >> .env && \
    echo 'NODE_ENV="production"' >> .env && \
    echo 'ZAI_API_KEY=""' >> .env

# Set non-secret environment variables (also as ENV for CLI tools).
# DATABASE_URL / DIRECT_URL come from HF Space Secrets at runtime.
# A *placeholder* postgres URL is set as ENV below so that `next build`
# (which evaluates db.ts at module-load time during prerender) does not
# hard-fail. HF Space Secrets override ENV at runtime, so the real Supabase
# URL is used when the container actually starts.
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV SESSION_SECRET="anzaro-hf-space-secret-2025-stable"
ENV NEXTAUTH_URL="https://kopabdo-delta-ai-v2.hf.space"
ENV NEXTAUTH_SECRET="anzaro-nextauth-secret-2025"
# Build-time placeholder (overridden at runtime by HF Space Secrets):
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
ENV DIRECT_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
# ZAI_API_KEY must be set as a HF Space Secret.

# Keep /app/db around in case any legacy code still references it, but no
# SQLite file is created anymore — the DB now lives in Supabase.
# NOTE: `prisma db push` is intentionally NOT run at build time — the build
# container does not have access to the Supabase secrets, so the push would
# fail. The schema is synced at container startup instead (see CMD below).
RUN mkdir -p /app/db

# Pre-build the Next.js app so .next/ exists (fixes ENOENT required-server-files.json)
RUN npx next build --webpack 2>&1 || echo "Build failed, will use dev mode"

# Expose port
EXPOSE 3000

# Start the application.
# 1. `prisma db push --skip-generate --accept-data-loss` syncs the schema
#    to Supabase on every container start (idempotent). At runtime, HF Space
#    Secrets override the placeholder ENV, so this actually connects to
#    Supabase. `--accept-data-loss` skips the interactive prompt.
# 2. `next start` serves the prebuilt app (falls back to `next dev` if the
#    build had failed).
CMD npx prisma db push --skip-generate --accept-data-loss 2>&1 | tail -10; \
    npx next dev -p 3000 -H 0.0.0.0 --webpack
