import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// ═══════════════════════════════════════════════════════════════════════
// PostgreSQL Connection Pool Configuration
// ═══════════════════════════════════════════════════════════════════════
// Migrated from SQLite to PostgreSQL for:
// - Better concurrent access (no file locking)
// - True ACID compliance with MVCC
// - Connection pooling via PgBouncer or built-in
// - Better scalability for production workloads
// - Full-text search, JSONB, and advanced indexing
// ═══════════════════════════════════════════════════════════════════════

export const db = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query'] : ['error'],
  // PostgreSQL connection pool settings
  // These are passed via the DATABASE_URL connection string parameters
  // e.g., postgresql://user:pass@host:5432/db?connection_limit=10&pool_timeout=20
})

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
