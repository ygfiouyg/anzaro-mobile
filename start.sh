#!/bin/sh
set +e

if [ -z "$DATABASE_URL" ]; then
  echo 'ERROR: DATABASE_URL is not set!'
  exit 1
fi

cat > /app/.z-ai-config << ZAICONF
{"baseUrl":"${ZAI_BASE_URL:-https://internal-api.z.ai/v1}","apiKey":"${ZAI_API_KEY:-Z.ai}","chatId":"${ZAI_CHAT_ID:-chat-default}","token":"${ZAI_TOKEN:-default}","userId":"${ZAI_USER_ID:-default}"}
ZAICONF

cat > /app/.env << ENVFILE
DATABASE_URL=${DATABASE_URL}
ZAI_API_KEY=${ZAI_API_KEY:-}
ZHIPUAI_API_KEY=${ZHIPUAI_API_KEY:-}
ZHIPU_API_KEY=${ZHIPU_API_KEY:-}
OPENROUTER_API_KEY=${OPENROUTER_API_KEY:-}
GROQ_API_KEY=${GROQ_API_KEY:-}
CEREBRAS_API_KEY=${CEREBRAS_API_KEY:-}
GEMINI_API_KEY=${GEMINI_API_KEY:-}
HUGGINGFACE_API_TOKEN=${HUGGINGFACE_API_TOKEN:-}
OPENAI_API_KEY=${OPENAI_API_KEY:-}
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}
GITHUB_MODELS_TOKEN=${GITHUB_MODELS_TOKEN:-}
ADMIN_EMAILS=${ADMIN_EMAILS:-}
ADMIN_PASSWORD=${ADMIN_PASSWORD:-}
SESSION_SECRET=${SESSION_SECRET:-}
CRON_SECRET=${CRON_SECRET:-}
JOB_WEBHOOK_SECRET=${JOB_WEBHOOK_SECRET:-}
BREVO_API_KEY=${BREVO_API_KEY:-}
BREVO_SENDER_EMAIL=${BREVO_SENDER_EMAIL:-}
BREVO_SENDER_NAME=${BREVO_SENDER_NAME:-}
RESEND_API_KEY=${RESEND_API_KEY:-}
RESEND_FROM_EMAIL=${RESEND_FROM_EMAIL:-}
TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN:-}
WHATSAPP_TOKEN=${WHATSAPP_TOKEN:-}
WHATSAPP_APP_SECRET=${WHATSAPP_APP_SECRET:-}
WHATSAPP_VERIFY_TOKEN=${WHATSAPP_VERIFY_TOKEN:-}
WHATSAPP_PHONE_NUMBER_ID=${WHATSAPP_PHONE_NUMBER_ID:-}
YOUTUBE_API_KEY=${YOUTUBE_API_KEY:-}
N8N_WEBHOOK_URL=${N8N_WEBHOOK_URL:-}
DELTAAI_PUBLIC_URL=${DELTAAI_PUBLIC_URL:-}
ENVFILE

echo 'Starting Anzaro AI (dev mode + Smart Ball integration)...'

# ── Database schema sync (creates Smart Ball tables: PersonalityProfile, Device, etc.) ──
echo '[DB] Running prisma generate...'
bunx prisma generate 2>&1 || echo '[WARN] prisma generate failed'
echo '[DB] Running prisma db push to sync schema (adds Smart Ball tables)...'
timeout 90 bunx prisma db push --accept-data-loss 2>&1 || echo '[WARN] prisma db push failed or timed out — continuing'
echo "[DEBUG] DB sync done."

# Start Telegram poller in background (long polling — more reliable than webhooks)
if [ -n "$TELEGRAM_BOT_TOKEN" ]; then
  echo "Starting Telegram bot poller..."
  bun telegram-poller.ts &
  echo "Telegram poller PID: $!"
else
  echo "No TELEGRAM_BOT_TOKEN — skipping bot"
fi

# Start Next.js in dev mode (avoids OOM from next build on HF Spaces)
export NODE_ENV=development
exec bunx next dev -p 3000 -H 0.0.0.0 --webpack
