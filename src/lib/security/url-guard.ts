/**
 * URL Security Helper
 * ==================
 * Validates URLs to prevent SSRF (Server-Side Request Forgery) attacks.
 *
 * SSRF allows attackers to make the server fetch internal resources:
 *   - Cloud metadata: http://169.254.169.254/ (AWS/Azure/GCP credentials)
 *   - Internal services: http://localhost:6379/ (Redis), http://10.0.0.1:5432/ (DB)
 *   - Loopback: http://127.0.0.1/, http://0.0.0.0/
 *
 * This helper resolves the URL's hostname and rejects private/loopback/link-local IPs.
 */

import { lookup } from "node:dns/promises";

// ─────────────────────────────────────────────────────────────
// Private IP ranges (RFC 1918 + special-use)
// ─────────────────────────────────────────────────────────────

const PRIVATE_IP_PATTERNS = [
  /^10\./,                          // 10.0.0.0/8
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12
  /^192\.168\./,                    // 192.168.0.0/16
  /^127\./,                         // 127.0.0.0/8 (loopback)
  /^0\./,                           // 0.0.0.0/8
  /^169\.254\./,                    // 169.254.0.0/16 (link-local / cloud metadata)
  /^100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\./, // 100.64.0.0/10 (CGNAT)
  /^192\.0\.0\./,                   // 192.0.0.0/24
  /^198\.1[89]\./,                  // 198.18.0.0/15 (benchmarking)
  /^::1$/,                          // IPv6 loopback
  /^fc00:/i,                        // IPv6 unique-local
  /^fe80:/i,                        // IPv6 link-local
  /^::ffff:127\./,                  // IPv4-mapped IPv6 loopback
  /^::ffff:10\./,
  /^::ffff:172\./,
  /^::ffff:192\.168\./,
];

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export interface UrlValidationResult {
  ok: boolean;
  error?: string;
  hostname?: string;
  ip?: string;
}

/**
 * Validate that a URL is safe to fetch (not SSRF).
 *
 * Checks:
 *   1. URL is well-formed
 *   2. Protocol is http or https
 *   3. Hostname is not an IP literal in private ranges
 *   4. DNS resolution doesn't point to private ranges
 *
 * @param urlStr - The URL to validate
 * @returns { ok: boolean, error?: string }
 */
export async function assertPublicUrl(urlStr: string): Promise<UrlValidationResult> {
  // 1. Parse URL
  let url: URL;
  try {
    url = new URL(urlStr);
  } catch {
    return { ok: false, error: "Invalid URL format" };
  }

  // 2. Protocol check
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: `Protocol "${url.protocol}" not allowed — only http/https` };
  }

  const hostname = url.hostname;

  // 3. Check if hostname is an IP literal
  const isIpLiteral = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.includes(":");

  if (isIpLiteral) {
    if (isPrivateIp(hostname)) {
      return { ok: false, error: `IP ${hostname} is in a private/reserved range (SSRF blocked)`, hostname };
    }
    return { ok: true, hostname, ip: hostname };
  }

  // 4. DNS resolution — reject if resolves to private IP
  try {
    const records = await lookup(hostname, { all: true });
    if (records.length === 0) {
      return { ok: false, error: `DNS resolution failed for ${hostname}` };
    }

    for (const record of records) {
      if (isPrivateIp(record.address)) {
        return {
          ok: false,
          error: `${hostname} resolves to private IP ${record.address} (SSRF blocked)`,
          hostname,
          ip: record.address,
        };
      }
    }

    return { ok: true, hostname, ip: records[0]?.address };
  } catch (e: any) {
    // DNS failure — allow but log (some legit services have flaky DNS)
    return { ok: true, hostname, error: `DNS lookup warning: ${e.message}` };
  }
}

/**
 * Synchronous check: is an IP address in a private/reserved range?
 */
export function isPrivateIp(ip: string): boolean {
  // Normalize IPv4-mapped IPv6
  const normalized = ip.replace(/^::ffff:/, "");
  return PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(normalized));
}

/**
 * Synchronous hostname check (no DNS) — for quick filtering.
 * Catches obvious cases like "localhost", "127.0.0.1", "169.254.169.254".
 */
export function isPrivateHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase().trim();

  // Common internal hostnames
  if (lower === "localhost" || lower === "metadata.google.internal") {
    return true;
  }

  // IP literal check
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(lower) || lower.includes(":")) {
    return isPrivateIp(lower);
  }

  return false;
}
