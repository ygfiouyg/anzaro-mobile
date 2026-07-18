/**
 * MCP Tool: HTTP Headers Checker
 * بيعمل HEAD request لأي URL ويرجّع الـ response headers.
 * مفيد لفحص security headers, caching, server info.
 */
import type { MCPTool } from "../types";

export const httpHeadersTool: MCPTool = {
  name: "http_headers",
  description: "فحص HTTP headers لأي URL (API حقيقي). استخدمها لما المستخدم يقول 'headers' أو 'http headers' أو 'security headers'.",
  parameters: {
    type: "object",
    properties: {
      url: { type: "string", description: "الـ URL للفحص (مثلاً: https://example.com)" },
      method: { type: "string", description: "HTTP method: HEAD أو GET (افتراضي: HEAD)", default: "HEAD" },
    },
    required: ["url"],
  },
  async execute(params) {
    let url = String(params.url || "").trim();
    const method = String(params.method || "HEAD").toUpperCase();
    if (!url) return { success: false, error: "url مطلوب" };

    // أضف https:// لو مش موجود
    if (!/^https?:\/\//i.test(url)) {
      url = `https://${url}`;
    }

    // تحقق من صحة الـ URL
    try {
      new URL(url);
    } catch {
      return { success: false, error: "صيغة URL غير صحيحة" };
    }

    const validMethods = ["HEAD", "GET"];
    const selMethod = validMethods.includes(method) ? method : "HEAD";

    try {
      const start = Date.now();
      const res = await fetch(url, {
        method: selMethod,
        redirect: "follow",
        signal: AbortSignal.timeout(15000),
        headers: { "User-Agent": "DeltaAI-MCP/1.0 (DeltaAI Header Checker)" },
      });
      const durationMs = Date.now() - start;

      // اجمع كل الـ headers
      const headers: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        headers[key] = value;
      });

      // security headers analysis
      const security: any = {
        has_strict_transport_security: !!headers["strict-transport-security"],
        has_content_security_policy: !!headers["content-security-policy"],
        has_x_frame_options: !!headers["x-frame-options"],
        has_x_content_type_options: !!headers["x-content-type-options"],
        has_referrer_policy: !!headers["referrer-policy"],
        has_permissions_policy: !!headers["permissions-policy"],
        has_x_xss_protection: !!headers["x-xss-protection"],
      };

      const securityScore = Object.values(security).filter(Boolean).length;
      const securityLevel =
        securityScore >= 6 ? "ممتازة" :
        securityScore >= 4 ? "جيدة" :
        securityScore >= 2 ? "متوسطة" :
        "ضعيفة";

      // caching info
      const caching: any = {
        cache_control: headers["cache-control"] || null,
        etag: headers["etag"] || null,
        last_modified: headers["last-modified"] || null,
        expires: headers["expires"] || null,
        age: headers["age"] || null,
      };

      return {
        success: true,
        data: {
          url,
          final_url: res.url || url,
          method: selMethod,
          status: res.status,
          status_text: res.statusText,
          ok: res.ok,
          redirected: res.redirected,
          duration_ms: durationMs,
          headers,
          server: headers["server"] || null,
          content_type: headers["content-type"] || null,
          content_length: headers["content-length"] ? parseInt(headers["content-length"]) : null,
          content_encoding: headers["content-encoding"] || null,
          security_headers: security,
          security_score: securityScore,
          security_level: securityLevel,
          caching,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
