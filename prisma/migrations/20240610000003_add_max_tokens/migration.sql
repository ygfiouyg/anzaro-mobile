-- AlterTable: Add maxTokens column to User table
-- Admin-controlled max tokens per account (platform max: 98304)
ALTER TABLE "User" ADD COLUMN "maxTokens" INTEGER NOT NULL DEFAULT 98304;
