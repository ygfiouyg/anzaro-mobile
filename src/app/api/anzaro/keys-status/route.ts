import { NextResponse } from 'next/server'
import { requireAnzaroUser } from '@/lib/anzaro-auth-helper'

// Returns the status of all AI provider + service keys.
// This powers the visual Keys Dashboard — shows which providers are configured.
export async function GET(req: Request) {
  try {
    const { user, response: authResp } = await requireAnzaroUser(req as any)
    if (authResp) return authResp

    // Check if user is admin to show all keys
    const isAdmin = user.role === 'admin'

    const keys = [
      // AI Providers
      { name: 'ZAI_API_KEY', label: 'Z.AI (GLM)', category: 'AI Provider', critical: true, configured: !!process.env.ZAI_API_KEY },
      { name: 'OPENAI_API_KEY', label: 'OpenAI (GPT-4o)', category: 'AI Provider', critical: false, configured: !!process.env.OPENAI_API_KEY },
      { name: 'ANTHROPIC_API_KEY', label: 'Anthropic (Claude)', category: 'AI Provider', critical: false, configured: !!process.env.ANTHROPIC_API_KEY },
      { name: 'GEMINI_API_KEY', label: 'Google Gemini', category: 'AI Provider', critical: false, configured: !!process.env.GEMINI_API_KEY },
      { name: 'GROQ_API_KEY', label: 'Groq (Llama)', category: 'AI Provider', critical: false, configured: !!process.env.GROQ_API_KEY },
      { name: 'CEREBRAS_API_KEY', label: 'Cerebras', category: 'AI Provider', critical: false, configured: !!process.env.CEREBRAS_API_KEY },
      { name: 'OPENROUTER_API_KEY', label: 'OpenRouter', category: 'AI Provider', critical: false, configured: !!process.env.OPENROUTER_API_KEY },
      { name: 'HUGGINGFACE_API_TOKEN', label: 'HuggingFace', category: 'AI Provider', critical: false, configured: !!process.env.HUGGINGFACE_API_TOKEN },
      { name: 'GITHUB_MODELS_TOKEN', label: 'GitHub Models', category: 'AI Provider', critical: false, configured: !!process.env.GITHUB_MODELS_TOKEN },

      // Database & Storage
      { name: 'DATABASE_URL', label: 'PostgreSQL Database', category: 'Database', critical: true, configured: !!process.env.DATABASE_URL },
      { name: 'SUPABASE_URL', label: 'Supabase', category: 'Database', critical: false, configured: !!process.env.SUPABASE_URL },

      // Auth & Security
      { name: 'SESSION_SECRET', label: 'Session Secret', category: 'Auth', critical: true, configured: !!process.env.SESSION_SECRET },
      { name: 'NEXTAUTH_SECRET', label: 'NextAuth Secret', category: 'Auth', critical: true, configured: !!process.env.NEXTAUTH_SECRET },
      { name: 'GOOGLE_CLIENT_ID', label: 'Google OAuth', category: 'Auth', critical: false, configured: !!process.env.GOOGLE_CLIENT_ID },

      // Integrations
      { name: 'TELEGRAM_BOT_TOKEN', label: 'Telegram Bot', category: 'Integration', critical: false, configured: !!process.env.TELEGRAM_BOT_TOKEN },
      { name: 'YOUTUBE_API_KEY', label: 'YouTube Data', category: 'Integration', critical: false, configured: !!process.env.YOUTUBE_API_KEY },
      { name: 'SPOTIFY_CLIENT_ID', label: 'Spotify', category: 'Integration', critical: false, configured: !!process.env.SPOTIFY_CLIENT_ID },

      // Email
      { name: 'BREVO_API_KEY', label: 'Brevo Email', category: 'Email', critical: false, configured: !!process.env.BREVO_API_KEY },
      { name: 'RESEND_API_KEY', label: 'Resend Email', category: 'Email', critical: false, configured: !!process.env.RESEND_API_KEY },
    ]

    const categories = [...new Set(keys.map((k) => k.category))]
    const grouped = categories.map((cat) => ({
      category: cat,
      keys: keys.filter((k) => k.category === cat),
      configured: keys.filter((k) => k.category === cat && k.configured).length,
      total: keys.filter((k) => k.category === cat).length,
    }))

    const totalConfigured = keys.filter((k) => k.configured).length
    const criticalConfigured = keys.filter((k) => k.critical && k.configured).length
    const criticalTotal = keys.filter((k) => k.critical).length

    return NextResponse.json({
      keys: isAdmin ? keys : keys.filter((k) => !k.name.includes('SECRET') && !k.name.includes('PASSWORD')),
      grouped,
      summary: {
        total: keys.length,
        configured: totalConfigured,
        missing: keys.length - totalConfigured,
        criticalConfigured,
        criticalTotal,
        health: criticalConfigured === criticalTotal ? 'healthy' : 'critical',
      },
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
