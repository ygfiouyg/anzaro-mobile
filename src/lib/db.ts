import { PrismaClient } from '@prisma/client'
import { existsSync } from 'fs'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// ═══════════════════════════════════════════════════════════════════════
// Prisma Client Initialization — HF Space / Production-safe
// ═══════════════════════════════════════════════════════════════════════
// Next.js production build INLINES process.env vars at build time.
// If DATABASE_URL is empty/undefined during build, it stays undefined at
// runtime even if the ENV var is set. This causes Prisma to fail with:
//   "Error validating datasource db: the URL must start with the protocol file:"
//
// Solution: resolve the DB URL with a hardcoded fallback that works on
// HF Space (/app/db/custom.db) and locally (/home/z/my-project/db/custom.db).
// ═══════════════════════════════════════════════════════════════════════

function resolveDatabaseUrl(): string {
  // 1. Explicit env var (set in Dockerfile ENV or .env)
  const envUrl = process.env.DATABASE_URL
  if (envUrl && envUrl.startsWith('file:')) return envUrl

  // 2. Hardcoded fallbacks for known environments
  const candidates = [
    'file:/app/db/custom.db',                    // HF Space Docker
    'file:/home/z/my-project/db/custom.db',      // Local dev sandbox
  ]

  for (const candidate of candidates) {
    const path = candidate.replace('file:', '')
    try {
      const dir = path.substring(0, path.lastIndexOf('/'))
      if (existsSync(dir)) return candidate
    } catch {
      // fs not available in some environments — skip
    }
  }

  // 3. Final fallback — let Prisma create the DB file
  return 'file:/app/db/custom.db'
}

const databaseUrl = resolveDatabaseUrl()
console.log('[DB] Using DATABASE_URL:', databaseUrl)

export const db = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query'] : ['error'],
  datasourceUrl: databaseUrl,
})

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
