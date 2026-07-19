// seed.js — Standalone seed script that runs with Node.js in Docker
// Creates the admin user, default settings, and radio stations on first startup
//
// ═══════════════════════════════════════════════════════════════════════
// SECURITY FIX: API keys are now read from environment variables instead
// of being hardcoded in source code. Set them in your .env or Docker
// environment / HuggingFace Spaces Secrets.
// ═══════════════════════════════════════════════════════════════════════

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PrismaClient } = require('@prisma/client');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ── Super Admin User ──────────────────────────────────────────────
  const adminEmail = (process.env.ADMIN_EMAILS || 'admin@delta-ai.local').split(',')[0].trim();
  const adminPasswordRaw = process.env.ADMIN_PASSWORD;
  let adminPasswordRawFinal;

  if (!adminPasswordRaw) {
    // SECURITY FIX #24: Was logging plaintext password to stdout.
    // Now writes to a root-only file instead (chmod 600).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crypto = require('crypto');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path');
    const fallback = crypto.randomBytes(16).toString('hex');
    const pwdFile = path.join(process.cwd(), '.admin-password');

    try {
      fs.writeFileSync(pwdFile, `Admin password: ${fallback}\nEmail: ${adminEmail}\n\nDelete this file after saving the password.\n`, { mode: 0o600 });
      console.error(`⚠️ ADMIN_PASSWORD not set. Auto-generated password written to ${pwdFile} (chmod 600).`);
      console.error('⚠️ Read that file for the password, then delete it. Set ADMIN_PASSWORD env var for a known password.');
    } catch (writeErr) {
      console.error(`⚠️ ADMIN_PASSWORD not set and could not write password file: ${writeErr.message}`);
      console.error('⚠️ Set ADMIN_PASSWORD environment variable before running seed.');
      process.exit(1);
    }
    adminPasswordRawFinal = fallback;
  } else {
    adminPasswordRawFinal = adminPasswordRaw;
  }

  // Use bcrypt instead of SHA256 for password hashing
  const adminPassword = await bcrypt.hash(adminPasswordRawFinal, 12);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      name: 'Super Admin',
      password: adminPassword,
      role: 'admin',
      language: 'ar',
      isActive: true,
      isVerified: true,
    },
  });

  console.log('✅ Admin user ready:', admin.email);

  // ── Admin Settings (API Keys) ─────────────────────────────────────
  const settings = [
    {
      key: 'zhipu_agent_key',
      value: process.env.ZHIPU_AGENT_KEY || '',
      category: 'ai',
      description: 'Zhipu AI Agent API Key',
    },
    {
      key: 'zhipu_platform_key',
      value: process.env.ZHIPU_PLATFORM_KEY || '',
      category: 'ai',
      description: 'Zhipu AI Platform API Key',
    },
    {
      key: 'google_ai_key',
      value: process.env.GOOGLE_AI_KEY || '',
      category: 'ai',
      description: 'Google AI API Key',
    },
  ];

  for (const setting of settings) {
    if (!setting.value) {
      console.warn(`⚠️ Setting ${setting.key} is empty — set the environment variable before deployment`);
    }
    await prisma.adminSettings.upsert({
      where: { key: setting.key },
      update: { value: setting.value, category: setting.category, description: setting.description },
      create: setting,
    });
    console.log('✅ Setting ready:', setting.key, setting.value ? '(configured)' : '(EMPTY — needs env var)');
  }

  // ── Default Radio Stations (URLs VERIFIED 2025-01-30) ─────────────
  // All URLs return audio/mpeg (or audio/aacp) with HTTP 200 when tested.
  // Previously these pointed to non-existent radiojar.com mountpoints that
  // all returned 404 — that was the root cause of "البث غير متاح" errors.
  const stations = [
    { name: 'إذاعة القرآن الكريم', streamUrl: 'https://qurango.net/radio/tarateel', category: 'quran', sortOrder: 1 },
    { name: 'إذاعة القرآن الكريم من القاهرة', streamUrl: 'https://stream.radiojar.com/8s5u5tpdtwzuv', category: 'quran', sortOrder: 2 },
    { name: 'إذاعة مشاري العفاسي', streamUrl: 'https://qurango.net/radio/mishary_alafasi', category: 'quran', sortOrder: 3 },
    { name: 'إذاعة أحمد العجمي', streamUrl: 'https://qurango.net/radio/ahmad_alajmy', category: 'quran', sortOrder: 4 },
    { name: 'نجوم FM', streamUrl: 'https://stream.zeno.fm/qb1zvsykm98uv', category: 'music', sortOrder: 5 },
    { name: 'راديو هيتس 88.2', streamUrl: 'https://radiohits882.radioca.st/;', category: 'music', sortOrder: 6 },
    { name: 'راديو 9090', streamUrl: 'https://9090streaming.mobtada.com/9090FMEGYPT', category: 'music', sortOrder: 7 },
    { name: 'راديو الشرق مع بلومبرج', streamUrl: 'https://l3.itworkscdn.net/asharqradioalive/asharqradioa/icecast.audio', category: 'news', sortOrder: 8 },
  ];

  for (const station of stations) {
    const existing = await prisma.radioStation.findFirst({ where: { name: station.name } });
    if (!existing) {
      await prisma.radioStation.create({ data: station });
      console.log('✅ Radio station created:', station.name);
    } else {
      console.log('⏭️ Radio station already exists:', station.name);
    }
  }

  console.log('🎉 Seeding complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    // ── FIX: Exit with error code so deployment fails visibly ──
    // Previously this swallowed errors silently, allowing a broken DB
    // schema to go unnoticed. Now we exit with code 1, but only in
    // production. In development, we continue so the dev server stays up.
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
