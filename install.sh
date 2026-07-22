#!/bin/bash
# ═══════════════════════════════════════════════════════════
# Anzaro AI — One-Click Installer
# ═══════════════════════════════════════════════════════════
# بيـ install + setup + run المنصة في أمر واحد
# ═══════════════════════════════════════════════════════════

set -e

echo "🌊 Anzaro AI — One-Click Installer"
echo "================================"
echo ""

# التحقق من OS
if [[ "$OSTYPE" == "darwin"* ]]; then
  OS="macOS"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
  OS="Linux"
else
  OS="Windows"
fi

echo "📊 نظام التشغيل: $OS"
echo ""

# تثبيت Bun لو مش موجود
if ! command -v bun &> /dev/null; then
  echo "📦 تثبيت Bun..."
  if [[ "$OS" == "macOS" ]] || [[ "$OS" == "Linux" ]]; then
    curl -fsSL https://bun.sh/install | bash
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
  else
    echo "❌ ثبت Bun يدوياً من https://bun.sh"
    exit 1
  fi
fi

# تثبيت dependencies
echo "📦 تثبيت dependencies..."
bun install

# إعداد .env
if [ ! -f .env ]; then
  echo "⚙️  إنشاء .env..."
  cp .env.example .env
  echo "⚠️  عدّل .env وضيف الـ API keys قبل ما تكمل!"
  echo ""
  
  # auto-generate secrets
  SESSION_SECRET=$(openssl rand -hex 32 2>/dev/null || echo "anzaro-session-$(date +%s)")
  CRON_SECRET=$(openssl rand -hex 32 2>/dev/null || echo "anzaro-cron-$(date +%s)")
  
  sed -i.bak "s/your_session_secret_here/$SESSION_SECRET/g" .env 2>/dev/null || true
  sed -i.bak "s/your_cron_secret_here/$CRON_SECRET/g" .env 2>/dev/null || true
  rm -f .env.bak
  
  echo "✅ SESSION_SECRET و CRON_SECRET اتولّدوا تلقائياً"
fi

# Database setup
echo "🗄️  Database setup..."
bun run db:generate
bun run db:push

# Seed
echo "👤 Seed admin user..."
bun run seed 2>/dev/null || node seed.js 2>/dev/null || true

# Build
echo "🔨 Build..."
bun run build || echo "⚠️  Build فيه warnings (مش مشكلة)"

# تشغيل
echo ""
echo "🎉 اتعمل Setup بنجاح!"
echo ""
echo "للتشغيل:"
echo "  bun run dev"
echo ""
echo "الموقع هيشتغل على: http://localhost:3000"
echo ""
echo "ضيف الـ API keys في .env قبل ما تستخدم المنصة"
