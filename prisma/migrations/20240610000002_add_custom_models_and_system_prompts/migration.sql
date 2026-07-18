-- ═══════════════════════════════════════════════════════════
-- Migration: Add CustomModel, SystemPromptOverride, HFDisabledModel tables
-- These models exist in the Prisma schema but were missing migrations
-- ═══════════════════════════════════════════════════════════

-- CreateTable: HFDisabledModel
CREATE TABLE IF NOT EXISTS "hf_disabled_models" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "disabledBy" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hf_disabled_models_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: HFDisabledModel
CREATE UNIQUE INDEX IF NOT EXISTS "hf_disabled_models_modelId_key" ON "hf_disabled_models"("modelId");

-- CreateTable: CustomModel
CREATE TABLE IF NOT EXISTS "custom_models" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "modelId" TEXT,
    "apiKey" TEXT,
    "authType" TEXT NOT NULL DEFAULT 'none',
    "authHeader" TEXT,
    "apiFormat" TEXT NOT NULL DEFAULT 'openai',
    "isFree" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 50,
    "icon" TEXT NOT NULL DEFAULT '⚡',
    "description" TEXT,
    "descriptionEn" TEXT,
    "sourceEndpointId" TEXT,
    "addedBy" TEXT,
    "capabilities" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_models_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: CustomModel
CREATE INDEX IF NOT EXISTS "custom_models_category_idx" ON "custom_models"("category");
CREATE INDEX IF NOT EXISTS "custom_models_provider_idx" ON "custom_models"("provider");
CREATE INDEX IF NOT EXISTS "custom_models_isActive_idx" ON "custom_models"("isActive");
CREATE INDEX IF NOT EXISTS "custom_models_priority_idx" ON "custom_models"("priority");

-- CreateTable: SystemPromptOverride
CREATE TABLE IF NOT EXISTS "SystemPromptOverride" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "labelEn" TEXT NOT NULL,
    "description" TEXT,
    "sourceFile" TEXT,
    "sourceKey" TEXT,
    "value" TEXT NOT NULL,
    "originalValue" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemPromptOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: SystemPromptOverride
CREATE UNIQUE INDEX IF NOT EXISTS "SystemPromptOverride_key_key" ON "SystemPromptOverride"("key");
CREATE INDEX IF NOT EXISTS "SystemPromptOverride_category_idx" ON "SystemPromptOverride"("category");
