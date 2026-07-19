import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // ── Super Admin User ──────────────────────────────────────────────
  // Read from environment variables (same pattern as seed.js used in Docker)
  const adminEmail = process.env.ADMIN_EMAILS?.split(',')[0]?.trim() || "admin@delta-ai.local";
  const adminPasswordRaw = process.env.ADMIN_PASSWORD || "";

  // Generate bcrypt hash (12 rounds — same as auth.ts)
  let adminPassword: string;
  if (adminPasswordRaw) {
    adminPassword = await bcrypt.hash(adminPasswordRaw, 12);
  } else {
    // Auto-generate a random password if not provided
    const generated = `admin_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    adminPassword = await bcrypt.hash(generated, 12);
    console.log(`⚠️  No ADMIN_PASSWORD set. Generated: ${generated}`);
    console.log(`⚠️  Please set ADMIN_PASSWORD env var for production!`);
  }

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      name: "Super Admin",
      password: adminPassword,
      role: "admin",
      language: "ar",
      isActive: true,
      isVerified: true,
    },
  });

  console.log(`✅ Admin user created: ${admin.email}`);

  // ── Admin Settings (API Keys) ─────────────────────────────────────
  // SECURITY: All API keys are read from environment variables
  // Never hardcode API keys in source code
  const settings = [
    {
      key: "zhipu_agent_key",
      value: process.env.ZHIPU_AGENT_KEY || "",
      category: "ai",
      description: "Zhipu AI Agent API Key",
    },
    {
      key: "zhipu_platform_key",
      value: process.env.ZHIPU_PLATFORM_KEY || "",
      category: "ai",
      description: "Zhipu AI Platform API Key",
    },
    {
      key: "google_ai_key",
      value: process.env.GOOGLE_AI_KEY || "",
      category: "ai",
      description: "Google AI API Key",
    },
  ];

  for (const setting of settings) {
    // Only seed if a value is provided via env var
    if (setting.value) {
      await prisma.adminSettings.upsert({
        where: { key: setting.key },
        update: { value: setting.value, category: setting.category, description: setting.description },
        create: setting,
      });
      console.log(`✅ Setting created: ${setting.key}`);
    } else {
      console.log(`⏭️ Setting skipped (no env var): ${setting.key}`);
    }
  }

  // ── Default Radio Stations (URLs VERIFIED 2025-01-30) ─────────────
  // All URLs return audio/mpeg (or audio/aacp) with HTTP 200 when tested.
  // Previously these pointed to non-existent radiojar.com mountpoints that
  // all returned 404 — that was the root cause of "البث غير متاح" errors.
  const stations = [
    {
      name: "إذاعة القرآن الكريم",
      streamUrl: "https://qurango.net/radio/tarateel",
      category: "quran",
      sortOrder: 1,
    },
    {
      name: "إذاعة القرآن الكريم من القاهرة",
      // Official ERTU Quran Radio Cairo (via radiojar) — VERIFIED 200 OK
      streamUrl: "https://stream.radiojar.com/8s5u5tpdtwzuv",
      category: "quran",
      sortOrder: 2,
    },
    {
      name: "إذاعة مشاري العفاسي",
      streamUrl: "https://qurango.net/radio/mishary_alafasi",
      category: "quran",
      sortOrder: 3,
    },
    {
      name: "إذاعة أحمد العجمي",
      streamUrl: "https://qurango.net/radio/ahmad_alajmy",
      category: "quran",
      sortOrder: 4,
    },
    {
      name: "نجوم FM",
      // Nogoum FM via zeno.fm — VERIFIED 200 OK
      streamUrl: "https://stream.zeno.fm/qb1zvsykm98uv",
      category: "music",
      sortOrder: 5,
    },
    {
      name: "راديو هيتس 88.2",
      streamUrl: "https://radiohits882.radioca.st/;",
      category: "music",
      sortOrder: 6,
    },
    {
      name: "راديو 9090",
      streamUrl: "https://9090streaming.mobtada.com/9090FMEGYPT",
      category: "music",
      sortOrder: 7,
    },
    {
      name: "راديو الشرق مع بلومبرج",
      // Radio Asharq — VERIFIED 200 OK + audio/aacp
      streamUrl: "https://l3.itworkscdn.net/asharqradioalive/asharqradioa/icecast.audio",
      category: "news",
      sortOrder: 8,
    },
  ];

  for (const station of stations) {
    const existing = await prisma.radioStation.findFirst({
      where: { name: station.name },
    });
    if (!existing) {
      await prisma.radioStation.create({ data: station });
      console.log(`✅ Radio station created: ${station.name}`);
    } else {
      console.log(`⏭️ Radio station already exists: ${station.name}`);
    }
  }

  console.log("🎉 Seeding complete!");
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
