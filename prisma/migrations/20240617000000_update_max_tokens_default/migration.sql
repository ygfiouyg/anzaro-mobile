-- AlterTable: Update maxTokens default from 98304 to 60000
-- Per user request — cap removed but default lowered for safety
ALTER TABLE "User" ALTER COLUMN "maxTokens" SET DEFAULT 60000;
