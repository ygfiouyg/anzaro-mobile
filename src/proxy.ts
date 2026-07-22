import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// ═══════════════════════════════════════════════════════════════════════
// Security Headers Middleware
// ═══════════════════════════════════════════════════════════════════════
// Adds important security headers to ALL responses:
// - Content-Security-Policy: Prevent XSS by controlling resource sources
// - X-Frame-Options: Prevent clickjacking
// - X-Content-Type-Options: Prevent MIME type sniffing
// - Referrer-Policy: Control referrer information
// - Permissions-Policy: Restrict browser features
// ═══════════════════════════════════════════════════════════════════════

export function proxy(request: NextRequest) {
  // ── Health check سريع — رد فوراً بدون ما Next.js يـ compile أي حاجة ──
  // HF Spaces بتـ check الـ app كل شوية؛ لو الـ compile بطيء → timeout
  const pathname = request.nextUrl.pathname;
  if (pathname === '/api/health' || pathname === '/health' || pathname === '/healthz') {
    return NextResponse.json({ status: 'ok', timestamp: Date.now() }, {
      headers: { 'Cache-Control': 'no-cache' },
    });
  }

  const response = NextResponse.next();

  // Allow framing from HuggingFace Spaces (required for HF embed)
  // SAMEORIGIN would block HF's iframe — use DENY only for non-HF deployments
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');

  // Prevent MIME type sniffing
  response.headers.set('X-Content-Type-Options', 'nosniff');

  // Control referrer information — only send origin to cross-origin
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Restrict browser features that could be abused
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(self), geolocation=(), payment=()'
  );

  // Content Security Policy — allow necessary sources for the app
  // Allows: self, inline styles/scripts (needed for Next.js), fonts, HF Spaces,
  //         YouTube iframes (frame-src), and radio/media streams (media-src)
  response.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Next.js requires unsafe-inline/eval
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", // Tailwind + fonts
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https: http:", // Allow images from any source (thumbnails etc.)
      // ── media-src: covers both <audio> and <video> elements ──
      // 'media-src' is the CORRECT CSP directive (NOT 'audio-src' which is invalid).
      // Allow self, data:, blob:, and any https: source so radio streams
      // (qurango.net, etc.) and TTS blob URLs can play directly without proxy.
      "media-src 'self' data: blob: https: http:",
      "connect-src 'self' https: http: wss: blob:", // Allow all https connections (API calls, streams)
      // ── frame-src: allow YouTube embeds to render inside chat ──
      // Without this, default-src 'self' blocks youtube.com iframes.
      "frame-src 'self' https://www.youtube.com https://*.youtube.com https://youtube-nocookie.com https://*.youtube-nocookie.com https://player.vimeo.com https://w.soundcloud.com https://*.twitch.tv",
      "frame-ancestors 'self' https://huggingface.co https://*.huggingface.co", // Allow HF Spaces iframe embed
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')
  );

  // ── CSRF Protection: Validate Origin/Referer for state-changing requests ──
  // V.47: Skip CSRF for auth routes — they have their own protection (tokens, cookies)
  const method = request.method.toUpperCase();
  const isAuthRoute = pathname.startsWith('/api/auth/');
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && !isAuthRoute) {
    const origin = request.headers.get('Origin');
    const referer = request.headers.get('Referer');
    const host = request.headers.get('Host');

    // Allow requests without Origin/Referer (API clients, mobile apps)
    // but validate them when present to prevent CSRF
    if (origin || referer) {
      const sourceUrl = origin || referer || '';

      // Use proper URL parsing instead of .includes() to prevent bypass
      // e.g. evil-localhost:3000.evil.com would bypass .includes('localhost:3000')
      let sourceHostname = '';
      try {
        const parsed = new URL(sourceUrl);
        sourceHostname = parsed.hostname;
      } catch {
        // Invalid URL — reject
        return NextResponse.json(
          { error: 'طلب غير مسموح به' },
          { status: 403 }
        );
      }

      const allowedHosts = [
        'localhost',
        '127.0.0.1',
      ];

      const allowedSuffixes = [
        '.huggingface.co',
        '.hf.space',
      ];

      const isAllowed =
        // Exact hostname match (for localhost, 127.0.0.1, or current host)
        allowedHosts.some(h => sourceHostname === h) ||
        sourceHostname === (host?.split(':')[0] || '') ||
        // Suffix match for trusted domains (e.g. xxx.huggingface.co)
        allowedSuffixes.some(suffix => sourceHostname.endsWith(suffix));

      if (!isAllowed) {
        return NextResponse.json(
          { error: 'طلب غير مسموح به' },
          { status: 403 }
        );
      }
    }
  }

  return response;
}

// Only run middleware on API routes and pages (skip static assets)
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (favicon)
     * - public folder assets
     */
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|eot)$).*)',
  ],
};
