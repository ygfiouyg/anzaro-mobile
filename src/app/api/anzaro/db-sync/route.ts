import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Creates the Smart Ball tables with Prisma-compatible column names (quoted camelCase).
// PostgreSQL folds unquoted identifiers to lowercase — Prisma uses quoted camelCase.
// So ALL column names MUST be quoted in the SQL.
export async function POST() {
  const results: string[] = []

  // Drop existing tables (they have lowercase columns from the first bad deploy)
  const drops = [
    'DROP TABLE IF EXISTS "MoodScene"',
    'DROP TABLE IF EXISTS "Routine"',
    'DROP TABLE IF EXISTS "Device"',
    'DROP TABLE IF EXISTS "MediaSession"',
    'DROP TABLE IF EXISTS "PersonalityProfile"',
    'DROP TABLE IF EXISTS "QuickAction"',
    'DROP TABLE IF EXISTS "ProactiveNudge"',
    'DROP TABLE IF EXISTS "McpTool"',
  ]
  for (const sql of drops) {
    try { await db.$executeRawUnsafe(sql) } catch {}
  }
  results.push('✓ Dropped old tables')

  const creates = [
    `CREATE TABLE "PersonalityProfile" (
      "id" TEXT PRIMARY KEY,
      "userId" TEXT UNIQUE NOT NULL,
      "markdown" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "age" INTEGER,
      "occupation" TEXT,
      "personaType" TEXT NOT NULL DEFAULT 'balanced',
      "dialect" TEXT NOT NULL DEFAULT 'egyptian',
      "leadership" INTEGER NOT NULL DEFAULT 50,
      "stubbornness" INTEGER NOT NULL DEFAULT 50,
      "analytical" INTEGER NOT NULL DEFAULT 50,
      "emotional" INTEGER NOT NULL DEFAULT 50,
      "sociability" INTEGER NOT NULL DEFAULT 50,
      "discipline" INTEGER NOT NULL DEFAULT 50,
      "humor" INTEGER NOT NULL DEFAULT 50,
      "driversJson" TEXT NOT NULL DEFAULT '[]',
      "preferencesJson" TEXT NOT NULL DEFAULT '[]',
      "triggersJson" TEXT NOT NULL DEFAULT '[]',
      "version" INTEGER NOT NULL DEFAULT 1,
      "interactionCount" INTEGER NOT NULL DEFAULT 0,
      "lastEvolvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL
    )`,
    `CREATE TABLE "Device" (
      "id" TEXT PRIMARY KEY,
      "entityId" TEXT UNIQUE NOT NULL,
      "friendlyName" TEXT NOT NULL,
      "domain" TEXT NOT NULL,
      "room" TEXT NOT NULL DEFAULT 'Living Room',
      "state" TEXT NOT NULL DEFAULT 'off',
      "attributesJson" TEXT NOT NULL DEFAULT '{}',
      "aliasesJson" TEXT NOT NULL DEFAULT '[]',
      "isControllable" BOOLEAN NOT NULL DEFAULT true,
      "icon" TEXT,
      "userId" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL
    )`,
    `CREATE TABLE "MediaSession" (
      "id" TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "type" TEXT NOT NULL DEFAULT 'radio',
      "title" TEXT NOT NULL,
      "source" TEXT NOT NULL,
      "streamUrl" TEXT,
      "stationId" TEXT,
      "status" TEXT NOT NULL DEFAULT 'stopped',
      "positionSec" INTEGER NOT NULL DEFAULT 0,
      "durationSec" INTEGER,
      "volume" INTEGER NOT NULL DEFAULT 70,
      "startedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL
    )`,
    `CREATE TABLE "MoodScene" (
      "id" TEXT PRIMARY KEY,
      "name" TEXT NOT NULL,
      "nameAr" TEXT NOT NULL,
      "description" TEXT NOT NULL,
      "triggerPhrase" TEXT NOT NULL,
      "icon" TEXT NOT NULL DEFAULT 'Sparkles',
      "color" TEXT NOT NULL DEFAULT 'violet',
      "actionsJson" TEXT NOT NULL DEFAULT '[]',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE "QuickAction" (
      "id" TEXT PRIMARY KEY,
      "userId" TEXT,
      "label" TEXT NOT NULL,
      "labelAr" TEXT,
      "icon" TEXT NOT NULL DEFAULT 'Zap',
      "command" TEXT NOT NULL,
      "actionType" TEXT NOT NULL DEFAULT 'natural',
      "targetId" TEXT,
      "useCount" INTEGER NOT NULL DEFAULT 0,
      "isPinned" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL
    )`,
    `CREATE TABLE "Routine" (
      "id" TEXT PRIMARY KEY,
      "userId" TEXT,
      "name" TEXT NOT NULL,
      "nameAr" TEXT NOT NULL,
      "description" TEXT NOT NULL,
      "triggerJson" TEXT NOT NULL DEFAULT '{}',
      "actionsJson" TEXT NOT NULL DEFAULT '[]',
      "learnedFrom" TEXT,
      "confidence" INTEGER NOT NULL DEFAULT 50,
      "isEnabled" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE "ProactiveNudge" (
      "id" TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "message" TEXT NOT NULL,
      "messageAr" TEXT,
      "triggerType" TEXT NOT NULL DEFAULT 'suggestion',
      "severity" TEXT NOT NULL DEFAULT 'info',
      "relatedEntity" TEXT,
      "scheduledFor" TIMESTAMP(3),
      "status" TEXT NOT NULL DEFAULT 'pending',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE "McpTool" (
      "id" TEXT PRIMARY KEY,
      "name" TEXT UNIQUE NOT NULL,
      "description" TEXT NOT NULL,
      "category" TEXT NOT NULL,
      "endpoint" TEXT,
      "inputSchemaJson" TEXT NOT NULL DEFAULT '{}',
      "outputType" TEXT NOT NULL DEFAULT 'text',
      "isEnabled" BOOLEAN NOT NULL DEFAULT true,
      "isLocal" BOOLEAN NOT NULL DEFAULT true,
      "latencyMs" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  ]

  for (const sql of creates) {
    try {
      await db.$executeRawUnsafe(sql)
      const tableName = (sql.match(/"(\w+)"/) || [])[1] || 'unknown'
      results.push(`✓ CREATE ${tableName}`)
    } catch (e: any) {
      results.push(`✗ CREATE: ${e.message.slice(0, 80)}`)
    }
  }

  return NextResponse.json({ ok: true, results })
}
