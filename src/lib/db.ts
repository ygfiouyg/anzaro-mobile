import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// ═══════════════════════════════════════════════════════════════════════
// Prisma Client Initialization — Production-safe
// ═══════════════════════════════════════════════════════════════════════
// In Next.js production mode, env vars from .env are inlined at BUILD time.
// This causes issues when the runtime env differs (e.g., HF Space container).
// Solution: explicitly pass datasourceUrl to PrismaClient so it reads the
// DATABASE_URL from process.env at RUNTIME, not build time.
// ═══════════════════════════════════════════════════════════════════════

// Resolve DATABASE_URL with fallback to the default SQLite path
const databaseUrl = process.env.DATABASE_URL || 'file:/app/db/custom.db'

export const db = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query'] : ['error'],
  datasourceUrl: databaseUrl,
})

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
