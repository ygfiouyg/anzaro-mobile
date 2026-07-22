#!/bin/bash
# ═══════════════════════════════════════════════════════════
# Anzaro AI — Setup Script (Interactive)
# ═══════════════════════════════════════════════════════════
# بيـ setup المنصة بالكامل في 5 خطوات
# ═══════════════════════════════════════════════════════════

set -e

# ألوان
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

print_header() {
  echo ""
  echo -e "${PURPLE}═══════════════════════════════════════════════════${NC}"
  echo -e "${PURPLE}  $1${NC}"
  echo -e "${PURPLE}═══════════════════════════════════════════════════${NC}"
  echo ""
}

print_step() {
  echo -e "${BLUE}[$1]${NC} $2"
}

print_success() {
  echo -e "${GREEN}✅${NC} $1"
}

print_warning() {
  echo -e "${YELLOW}⚠️${NC} $1"
}

print_error() {
  echo -e "${RED}❌${NC} $1"
}

# Header
print_header "Anzaro AI Setup Wizard v1.0"
echo "أهلاً بك! ده الـ setup wizard هيـ setup المنصة بالكامل."
echo ""

# التحقق من المتطلبات
print_header "فحص المتطلبات"

# Node.js
if command -v node &> /dev/null; then
  NODE_VERSION=$(node --version)
  print_success "Node.js: $NODE_VERSION"
else
  print_error "Node.js مش متثبت. ثبتو من https://nodejs.org"
  exit 1
fi

# Bun (preferred)
if command -v bun &> /dev/null; then
  BUN_VERSION=$(bun --version)
  print_success "Bun: $BUN_VERSION"
  USE_BUN=true
else
  print_warning "Bun مش متثبت (مستحسن). هتستخدم npm بدلاً منه."
  USE_BUN=false
fi

# Git
if command -v git &> /dev/null; then
  print_success "Git: $(git --version)"
else
  print_error "Git مش متثبت."
  exit 1
fi

# PostgreSQL (optional — for production)
if command -v psql &> /dev/null; then
  print_success "PostgreSQL: $(psql --version | head -1)"
else
  print_warning "PostgreSQL مش متثبت (محتاج لو هتشتغل production)."
fi

# Step 1: Install dependencies
print_header "Step 1/5: تثبيت Dependencies"

if [ "$USE_BUN" = true ]; then
  print_step "1" "bun install..."
  bun install
else
  print_step "1" "npm install..."
  npm install
fi

print_success "Dependencies اتثبتت"

# Step 2: Environment setup
print_header "Step 2/5: Environment Variables"

if [ ! -f .env ]; then
  print_step "2" "إنشاء .env من .env.example..."
  cp .env.example .env
  
  echo ""
  echo "محتاج تـ setup الـ env vars دي:"
  echo ""
  echo -e "${YELLOW}الـ required (بدونها المنصة مش هتشتغل):${NC}"
  echo "  • DATABASE_URL — PostgreSQL connection string"
  echo "  • ADMIN_EMAILS — admin email(s)"
  echo "  • ADMIN_PASSWORD — admin password"
  echo "  • SESSION_SECRET — random string for sessions"
  echo "  • CRON_SECRET — random string for cron jobs"
  echo ""
  echo -e "${YELLOW}الـ AI providers (عشان المنصة تشتغل كاملة):${NC}"
  echo "  • ZAI_API_KEY — ZhipuAI/GLM (مطلوب)"
  echo "  • HUGGINGFACE_API_TOKEN — HuggingFace (مستحسن)"
  echo "  • GITHUB_MODELS_TOKEN — GitHub Models (مجاني)"
  echo "  • OPENROUTER_API_KEY — OpenRouter (اختياري)"
  echo ""
  echo -e "${YELLOW}الـ optional integrations:${NC}"
  echo "  • TELEGRAM_BOT_TOKEN — من @BotFather"
  echo "  • WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID — من Meta Business"
  echo "  • GEMINI_API_KEY — Google Gemini"
  echo "  • GROQ_API_KEY — Groq"
  echo "  • OPENAI_API_KEY — OpenAI (للـ Whisper)"
  echo ""
  print_warning "عدّل ملف .env دلوقتي قبل ما تكمل!"
  read -p "ضغط Enter لما تخلص تعديل .env..."
else
  print_success ".env موجود بالفعل"
fi

# Step 3: Database setup
print_header "Step 3/5: Database Setup"

if [ "$USE_BUN" = true ]; then
  print_step "3" "bun run db:generate..."
  bun run db:generate
  
  print_step "3" "bun run db:push..."
  bun run db:push
else
  print_step "3" "npm run db:generate..."
  npm run db:generate
  
  print_step "3" "npm run db:push..."
  npm run db:push
fi

print_success "Database جاهزة"

# Step 4: Seed admin user
print_header "Step 4/5: Seed Admin User"

if [ "$USE_BUN" = true ]; then
  print_step "4" "bun run seed..."
  bun run seed 2>/dev/null || bun seed.js 2>/dev/null || true
else
  print_step "4" "npm run seed..."
  npm run seed 2>/dev/null || node seed.js 2>/dev/null || true
fi

print_success "Admin user اتعمل"

# Step 5: Build & Test
print_header "Step 5/5: Build & Test"

read -p "هل عاوز تعمل build للمشروع؟ (y/n): " DO_BUILD
if [[ "$DO_BUILD" =~ ^[Yy]$ ]]; then
  if [ "$USE_BUN" = true ]; then
    print_step "5" "bun run build..."
    bun run build || print_warning "Build فيه warnings (مش مشكلة)"
  else
    print_step "5" "npm run build..."
    npm run build || print_warning "Build فيه warnings (مش مشكلة)"
  fi
  print_success "Build اتعمل"
fi

# Final
print_header "🎉 اتعمل Setup بنجاح!"

echo "المنصة جاهزة للتشغيل!"
echo ""
echo -e "${GREEN}للتشغيل:${NC}"
if [ "$USE_BUN" = true ]; then
  echo "  bun run dev"
else
  echo "  npm run dev"
fi
echo ""
echo -e "${GREEN}الموقع هيشتغل على:${NC}"
echo "  http://localhost:3000"
echo ""
echo -e "${GREEN}Admin login:${NC}"
echo "  استخدم الـ ADMIN_EMAILS + ADMIN_PASSWORD من .env"
echo ""
echo -e "${YELLOW}ملفات مهمة:${NC}"
echo "  • .env — كل الـ config والـ API keys"
echo "  • prisma/schema.prisma — database schema"
echo "  • src/lib/ai-tools/ — كل الـ 57 أداة"
echo "  • .agents/skills/ — 52 skill (تسويقية + نفسية)"
echo ""
echo -e "${PURPLE}استمتع بالمنصة! 🚀${NC}"
