/**
 * GET /api/setup-db
 * Creates missing tables in PostgreSQL via raw SQL
 * ADMIN ONLY — requires valid admin session token
 *
 * Security fix: Was previously PUBLIC (no auth), allowing anyone to
 * execute 14 raw SQL queries. Now gated behind admin authentication.
 */
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { extractBearerToken, getUserFromToken } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(request: Request) {
  // ── Auth gate: require admin ──
  const token = extractBearerToken(request.headers.get('Authorization'));
  if (!token) {
    return NextResponse.json(
      { success: false, error: 'غير مصرح — مطلوب تسجيل الدخول' },
      { status: 401 }
    );
  }

  let user;
  try {
    user = await getUserFromToken(token);
  } catch {
    return NextResponse.json(
      { success: false, error: 'جلسة غير صالحة' },
      { status: 401 }
    );
  }

  if (!user || user.role !== 'admin') {
    return NextResponse.json(
      { success: false, error: 'غير مصرح — مطلوب صلاحيات الآدمن' },
      { status: 403 }
    );
  }

  // ── Proceed with DB setup (admin verified) ──
  const results: string[] = [];

  try {
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "custom_agents" ("id" TEXT NOT NULL, "name" TEXT NOT NULL, "nameEn" TEXT, "description" TEXT NOT NULL, "icon" TEXT NOT NULL DEFAULT '🤖', "color" TEXT NOT NULL DEFAULT 'from-violet-500 to-fuchsia-500', "systemPrompt" TEXT NOT NULL, "toolsJson" TEXT NOT NULL, "suggestionsJson" TEXT, "category" TEXT NOT NULL DEFAULT 'custom', "isPublic" BOOLEAN NOT NULL DEFAULT false, "runCount" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "custom_agents_pkey" PRIMARY KEY ("id"));`);
    results.push('custom_agents');

    await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "custom_agents_category_idx" ON "custom_agents"("category");`);
    await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "custom_agents_isPublic_idx" ON "custom_agents"("isPublic");`);

    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "external_mcp_servers" ("id" TEXT NOT NULL, "name" TEXT NOT NULL, "url" TEXT NOT NULL, "transport" TEXT NOT NULL DEFAULT 'streamable-http', "authToken" TEXT, "ownerId" TEXT, "isEnabled" BOOLEAN NOT NULL DEFAULT true, "toolCount" INTEGER NOT NULL DEFAULT 0, "toolsCacheJson" TEXT, "lastConnectedAt" TIMESTAMP(3), "lastError" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "external_mcp_servers_pkey" PRIMARY KEY ("id"));`);
    results.push('external_mcp_servers');

    await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "external_mcp_servers_isEnabled_idx" ON "external_mcp_servers"("isEnabled");`);
    await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "external_mcp_servers_ownerId_idx" ON "external_mcp_servers"("ownerId");`);

    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "mcp_jobs" ("id" TEXT NOT NULL, "type" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'pending', "sourceTool" TEXT, "inputsJson" TEXT, "resultJson" TEXT, "errorMessage" TEXT, "webhookUrl" TEXT, "ownerId" TEXT, "startedAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3), "progress" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "mcp_jobs_pkey" PRIMARY KEY ("id"));`);
    results.push('mcp_jobs');

    await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "mcp_jobs_status_idx" ON "mcp_jobs"("status");`);
    await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "mcp_jobs_type_idx" ON "mcp_jobs"("type");`);
    await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "mcp_jobs_ownerId_idx" ON "mcp_jobs"("ownerId");`);
    await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "mcp_jobs_createdAt_idx" ON "mcp_jobs"("createdAt");`);

    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "mcp_job_steps" ("id" TEXT NOT NULL, "jobId" TEXT NOT NULL, "stepName" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'pending', "outputJson" TEXT, "errorMessage" TEXT, "startedAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "mcp_job_steps_pkey" PRIMARY KEY ("id"));`);
    results.push('mcp_job_steps');

    await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "mcp_job_steps_jobId_idx" ON "mcp_job_steps"("jobId");`);
    await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "mcp_job_steps_status_idx" ON "mcp_job_steps"("status");`);
    await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "mcp_job_steps_jobId_stepName_key" ON "mcp_job_steps"("jobId", "stepName");`);

    return NextResponse.json({ success: true, tables: results });
  } catch (e: unknown) {
    const error = e as Error;
    return NextResponse.json(
      { success: false, error: error.message, tables: results },
      { status: 500 }
    );
  }
}
