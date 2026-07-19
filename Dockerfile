# ─── Anzaro AI — HuggingFace Space Dockerfile ───────────────────────────
# Next.js 16 app with Prisma + SQLite, running on port 3000
# ─────────────────────────────────────────────────────────────────────────

FROM node:20-slim

# Install system dependencies for sharp, bcrypt, prisma
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    python3 \
    make \
    g++ \
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

# Generate Prisma client
RUN npx prisma generate 2>/dev/null || true

# Copy source code
COPY . .

# Create .env file with production values (HF Space doesn't have .env from git)
# This ensures DATABASE_URL is available to both Prisma CLI and Next.js runtime
RUN echo 'DATABASE_URL="file:/app/db/custom.db"' > .env && \
    echo 'SESSION_SECRET="anzaro-hf-space-secret-2025-stable"' >> .env && \
    echo 'NEXTAUTH_URL="https://kopabdo-delta-ai-v2.hf.space"' >> .env && \
    echo 'NEXTAUTH_SECRET="anzaro-nextauth-secret-2025"' >> .env && \
    echo 'NODE_ENV="production"' >> .env

# Set environment variables (also as ENV for CLI tools)
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV DATABASE_URL="file:/app/db/custom.db"
ENV SESSION_SECRET="anzaro-hf-space-secret-2025-stable"
ENV NEXTAUTH_URL="https://kopabdo-delta-ai-v2.hf.space"
ENV NEXTAUTH_SECRET="anzaro-nextauth-secret-2025"

# Create db directory, .env file, and push schema
# The .env ensures next build can read DATABASE_URL at build time
RUN mkdir -p /app/db && \
    touch /app/db/custom.db && \
    npx prisma db push --skip-generate 2>/dev/null || true

# Pre-build the Next.js app so .next/ exists (fixes ENOENT required-server-files.json)
RUN npx next build --webpack 2>&1 || echo "Build failed, will use dev mode"

# Expose port
EXPOSE 3000

# Start the application — use next start (production) since we built above
# Falls back to next dev if build failed
CMD npx next start -p 3000 -H 0.0.0.0 2>/dev/null || npx next dev -p 3000 -H 0.0.0.0 --webpack
