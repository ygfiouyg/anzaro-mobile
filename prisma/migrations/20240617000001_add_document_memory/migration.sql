-- CreateTable: DocumentMemory — persistent file content storage for compilation
CREATE TABLE "document_memory" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "userRequest" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'uploaded',
    "filesJson" TEXT NOT NULL,
    "fileCount" INTEGER NOT NULL DEFAULT 0,
    "totalChars" INTEGER NOT NULL DEFAULT 0,
    "lastPdfPath" TEXT,
    "feedback" TEXT,
    "language" TEXT NOT NULL DEFAULT 'ar',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_memory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_memory_ownerId_idx" ON "document_memory"("ownerId");
CREATE INDEX "document_memory_status_idx" ON "document_memory"("status");
