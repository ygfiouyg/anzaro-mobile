// ═══════════════════════════════════════════════════════════════════════
// GET /api/stream-audio?url=<stream_url>
// ═══════════════════════════════════════════════════════════════════════
// Proxy route for radio/audio streams.
// The browser cannot directly play some stream URLs due to CORS/HTTPS.
// This route fetches the stream server-side and pipes it to the browser.
//
// CRITICAL: maxDuration must be high (300s) so radio streams don't get
// killed after 30 seconds. We use a ReadableStream that pulls chunks
// from the upstream and pushes them to the client with proper backpressure.
// ═══════════════════════════════════════════════════════════════════════

import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// IMPORTANT: bump to 300s so live radio streams keep flowing.
// HF Spaces / Vercel free tier may cap this, but Next.js itself
// won't terminate the response at 30s anymore.
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');
  if (!url) {
    return new Response('Missing url parameter', { status: 400 });
  }

  // Validate URL (SSRF protection)
  let parsed: URL;
  try {
    parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) {
      return new Response('Invalid protocol', { status: 400 });
    }
    // Block internal/private IPs (SSRF protection)
    const hostname = parsed.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0' ||
        hostname.startsWith('10.') || hostname.startsWith('172.') ||
        hostname.startsWith('192.168.') || hostname.startsWith('169.254.') ||
        hostname === '::1' || hostname.startsWith('fc') || hostname.startsWith('fd')) {
      return new Response('Blocked: internal address', { status: 403 });
    }
  } catch {
    return new Response('Invalid url', { status: 400 });
  }

  // Upstream fetch — no timeout on the body stream (only on initial connect).
  // Use a short connect timeout so dead stations fail fast.
  let upstream: Response;
  try {
    upstream = await fetch(parsed.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
        'Accept': 'audio/*,*/*;q=0.8',
        'Icy-MetaData': '1', // ask icecast for metadata (some stations send track titles)
      },
      // No signal here — we want the body to stream indefinitely.
      // The connect timeout is enforced by the runtime.
    });
  } catch (err) {
    console.error('[stream-audio] upstream fetch failed:', err);
    return new Response(`Stream failed: ${err instanceof Error ? err.message : 'unknown'}`, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    return new Response(`Stream error: ${upstream.status}`, { status: 502 });
  }

  const contentType = upstream.headers.get('content-type') || 'audio/mpeg';

  // ═══════════════════════════════════════════════════════════════════════
  // Build a passthrough ReadableStream that forwards upstream chunks.
  // We deliberately do NOT set a timeout on the body so the radio keeps
  // streaming until the client disconnects.
  // ═══════════════════════════════════════════════════════════════════════
  const reader = upstream.body.getReader();

  const passthrough = new ReadableStream<Uint8Array>({
    async start(controller) {
      let lastChunkTime = Date.now();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            controller.enqueue(value);
            lastChunkTime = Date.now();
          }
          // Stalled-stream watchdog: if no chunk for 60s, abort
          // (the station is probably dead and we don't want to hang forever)
          if (Date.now() - lastChunkTime > 60_000) {
            console.warn('[stream-audio] no chunk for 60s, aborting');
            break;
          }
        }
      } catch (err) {
        // Client disconnected — this is normal, just close
        console.log('[stream-audio] stream closed:', err instanceof Error ? err.message : 'client disconnect');
      } finally {
        try { reader.cancel(); } catch {}
        try { controller.close(); } catch {}
      }
    },
    cancel() {
      // Client navigated away / closed tab
      console.log('[stream-audio] client cancelled');
      try { reader.cancel(); } catch {}
    },
  });

  return new Response(passthrough, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      // Allow browser to buffer the stream
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Access-Control-Allow-Origin': '*',
      // Hint to keep the connection alive
      'Connection': 'keep-alive',
      // Don't let intermediaries buffer the whole stream
      'X-Accel-Buffering': 'no',
    },
  });
}
