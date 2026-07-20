import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// ═══════════════════════════════════════════════════════════════════════
// Prisma Client Initialization — Supabase PostgreSQL (production-safe)
// ═══════════════════════════════════════════════════════════════════════
// The app now uses Supabase PostgreSQL (persistent across HF Space rebuilds).
// The DATABASE_URL and DIRECT_URL env vars are configured as HF Space Secrets.
//
// Next.js production build INLINES process.env vars at build time. If
// DATABASE_URL is empty/undefined during build, it stays undefined at runtime
// even if the ENV var is later set. To prevent silent SQLite fallbacks that
// caused the previous data-loss bug, we now HARD-FAIL if DATABASE_URL is
// missing instead of guessing a file path.
// ═══════════════════════════════════════════════════════════════════════

function resolveDatabaseUrl(): string {
  const envUrl = process.env.DATABASE_URL
  if (envUrl && envUrl.trim().length > 0) {
    return envUrl.trim()
  }

  // Hard-fail: no silent SQLite fallback (caused data loss on HF Space).
  throw new Error(
    '[DB] FATAL: DATABASE_URL env var is not set. ' +
      'Configure it as a HF Space Secret pointing to your Supabase PostgreSQL connection string ' +
      '(format: postgresql://postgres.<project>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres). ' +
      'Also set DIRECT_URL for migrations (port 5432).'
  )
}

const databaseUrl = resolveDatabaseUrl()

// Mask credentials when logging — never print the password.
function maskUrl(url: string): string {
  try {
    const u = new URL(url)
    if (u.password) u.password = '***'
    if (u.username) u.username = u.username // keep username for debugging
    return u.toString()
  } catch {
    // Not a URL (shouldn't happen with postgresql:// but be safe)
    return url.replace(/:[^:@/]+@/, ':***@')
  }
}

console.log('[DB] Using DATABASE_URL:', maskUrl(databaseUrl))

export const db = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query'] : ['error'],
  datasourceUrl: databaseUrl,
})

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
