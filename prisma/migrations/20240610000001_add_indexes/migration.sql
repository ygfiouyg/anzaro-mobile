-- AddMissingIndexes: Performance indexes for common queries
-- Conversation.userId: every user fetches their conversations
CREATE INDEX IF NOT EXISTS "Conversation_userId_idx" ON "Conversation"("userId");

-- ApiEndpoint: common filter/sort columns
CREATE INDEX IF NOT EXISTS "ApiEndpoint_category_idx" ON "ApiEndpoint"("category");
CREATE INDEX IF NOT EXISTS "ApiEndpoint_provider_idx" ON "ApiEndpoint"("provider");
CREATE INDEX IF NOT EXISTS "ApiEndpoint_isAvailable_idx" ON "ApiEndpoint"("isAvailable");
CREATE INDEX IF NOT EXISTS "ApiEndpoint_priority_idx" ON "ApiEndpoint"("priority");
