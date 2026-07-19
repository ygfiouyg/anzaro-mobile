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

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV DATABASE_URL="file:/app/db/custom.db"
ENV SESSION_SECRET="anzaro-hf-space-secret-2025-stable"

# Create db directory and push schema
RUN mkdir -p /app/db && npx prisma db push --skip-generate 2>/dev/null || true

# Expose port
EXPOSE 3000

# Start the application (use next dev since we need runtime compilation for HF)
CMD ["npx", "next", "dev", "-p", "3000", "-H", "0.0.0.0", "--webpack"]
