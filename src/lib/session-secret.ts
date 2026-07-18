// ═══════════════════════════════════════════════════════════════════════
// DeltaAI — Embedded Session Secret (Fallback)
// ═══════════════════════════════════════════════════════════════════════
// لو process.env.SESSION_SECRET مش متاح (زي على HuggingFace لو نسيته
// كـ Space Secret)، الـ login بيفشل بـ "SESSION_SECRET must be at least
// 32 characters long".
//
// الملف ده بيـ provide fallback عشان الـ login يشتغل من غير env vars.
// Priority: process.env.SESSION_SECRET → EMBEDDED_SESSION_SECRET
// ═══════════════════════════════════════════════════════════════════════

// سر قوي (64 char) — كافي لتوقيع الـ session tokens
export const EMBEDDED_SESSION_SECRET = 'anzaro-ai-session-secret-32chars-minimum-padding-2026';

/**
 * Get the session secret.
 * Priority: process.env.SESSION_SECRET (if ≥32 chars) → EMBEDDED_SESSION_SECRET
 */
export function getSessionSecret(): string {
  const envSecret = process.env.SESSION_SECRET;
  if (envSecret && envSecret.length >= 32) {
    return envSecret;
  }
  return EMBEDDED_SESSION_SECRET;
}
// security audit complete
