// ═══════════════════════════════════════════════════════════════════════
// Next.js Instrumentation — Runs once on server startup
// ═══════════════════════════════════════════════════════════════════════
// Starts background jobs like session/OTP cleanup
// Validates critical environment variables at startup (fail fast)
// ═══════════════════════════════════════════════════════════════════════

export async function register() {
  // Only run on the server, not during build
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // ── Validate critical environment variables at startup ──
    // Fail fast instead of crashing at runtime on first auth operation
    const criticalVars = [
      { name: 'SESSION_SECRET', reason: 'Required for generating secure session tokens' },
      { name: 'DATABASE_URL', reason: 'Required for database connection (PostgreSQL)' },
    ];

    const missing: string[] = [];
    for (const { name, reason } of criticalVars) {
      if (!process.env[name]) {
        console.error(`❌ FATAL: ${name} is not set. ${reason}.`);
        missing.push(name);
      }
    }

    if (missing.length > 0) {
      console.error(`❌ FATAL: Missing required environment variables: ${missing.join(', ')}`);
      console.error('❌ The application cannot start safely. Set these variables in your hosting platform secrets.');
      // In production, throw to prevent the app from starting in a broken state
      if (process.env.NODE_ENV === 'production') {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
      }
      // In development, just warn (don't crash — developer might be setting up)
      console.warn('⚠️ Running in development mode — continuing without these variables, but auth will fail.');
    } else {
      console.log('✅ All critical environment variables are set');
    }

    // Start background cleanup job
    const { startCleanupJob } = await import('@/lib/cleanup');
    startCleanupJob();

    // ── Auto-setup Telegram bot webhook if token is set ──
    try {
      const { autoSetupTelegramWebhook } = await import('@/lib/integrations/telegram-webhook');
      setTimeout(() => {
        autoSetupTelegramWebhook().catch((e) => {
          console.error('[Startup] Telegram webhook setup error:', e.message);
        });
      }, 3000);
    } catch (e: any) {
      console.error('[Startup] Could not load Telegram webhook module:', e.message);
    }
  }
}
