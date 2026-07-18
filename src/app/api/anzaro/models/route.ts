import { NextResponse } from 'next/server'
import { requireAnzaroUser } from '@/lib/anzaro-auth-helper'

// Centralized Model Provider Registry
// Returns all available AI models + their providers + configuration status.
// This powers the Header Model Selector and ensures dynamic routing (no hardcoded fallbacks).
export async function GET(req: Request) {
  try {
    const { user, response: authResp } = await requireAnzaroUser(req as any)
    if (authResp) return authResp

    // Import the platform's model registry — V.14: NO hardcoded fallback
    let models: any[] = []
    try {
      const mod = await import('@/lib/models')
      // The export is named `models`, not `ALL_MODELS`
      models = mod.models || mod.ALL_MODELS || []
    } catch (e) {
      // V.14: Return empty array — Dashboard shows "Syncing providers..." state
      models = []
    }

    // Group by provider
    const providers: Record<string, any[]> = {}
    for (const model of models) {
      const provider = model.provider || 'unknown'
      if (!providers[provider]) providers[provider] = []
      providers[provider].push(model)
    }

    // Check which providers have API keys configured
    const providerStatus: Record<string, { configured: boolean; keyName: string; modelCount: number }> = {}
    const providerKeyMap: Record<string, string> = {
      zai: 'ZAI_API_KEY',
      zhipuai: 'ZHIPUAI_API_KEY',
      openai: 'OPENAI_API_KEY',
      anthropic: 'ANTHROPIC_API_KEY',
      gemini: 'GEMINI_API_KEY',
      groq: 'GROQ_API_KEY',
      cerebras: 'CEREBRAS_API_KEY',
      openrouter: 'OPENROUTER_API_KEY',
      huggingface: 'HUGGINGFACE_API_TOKEN',
      github: 'GITHUB_MODELS_TOKEN',
      pollinations: 'POLLINATIONS_API_KEY',
      cloudflare: 'CF_API_TOKEN',
    }

    for (const [provider, providerModels] of Object.entries(providers)) {
      const keyName = providerKeyMap[provider] || `${provider.toUpperCase()}_API_KEY`
      providerStatus[provider] = {
        configured: !!process.env[keyName],
        keyName,
        modelCount: providerModels.length,
      }
    }

    const totalModels = models.length
    const configuredProviders = Object.values(providerStatus).filter((p) => p.configured).length
    const totalProviders = Object.keys(providerStatus).length

    return NextResponse.json({
      models,
      providers: providerStatus,
      summary: {
        totalModels,
        totalProviders,
        configuredProviders,
        unconfiguredProviders: totalProviders - configuredProviders,
        health: configuredProviders >= 1 ? 'healthy' : 'critical',
      },
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
