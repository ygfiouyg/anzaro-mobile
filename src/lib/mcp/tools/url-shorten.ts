/**
 * MCP Tool — URL Shortener
 * ========================
 * اختصار روابط طويلة عبر is.gd API (مجاني 100% بدون key).
 */
import type { MCPTool } from "../types";

export const urlShortenTool: MCPTool = {
  name: "url_shorten",
  description:
    "Shorten a long URL using the free is.gd API (no API key required). Returns the short URL and original URL.",
  parameters: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The long URL to shorten (must start with http:// or https://).",
      },
      customKeyword: {
        type: "string",
        description: "Optional custom short keyword (e.g. 'mylink' → https://is.gd/mylink).",
      },
      logStats: {
        type: "boolean",
        description: "If true, the short URL will have public stats available at <shorturl>-. Default false.",
        default: false,
      },
    },
    required: ["url"],
  },
  async execute(params) {
    const url = String(params.url || "").trim();
    const customKeyword = params.customKeyword ? String(params.customKeyword).trim() : "";
    const logStats = Boolean(params.logStats);

    if (!url) {
      return { success: false, error: "url مطلوبة" };
    }
    if (!/^https?:\/\//i.test(url)) {
      return { success: false, error: "url لازم تبدأ بـ http:// أو https://" };
    }
    if (customKeyword && !/^[a-zA-Z0-9_-]{4,30}$/.test(customKeyword)) {
      return {
        success: false,
        error: "customKeyword لازم يكون 4-30 حرف/رقم/شرطة سفلية فقط",
      };
    }

    try {
      const params2 = new URLSearchParams({
        url,
        format: "json",
        logstats: logStats ? "1" : "0",
      });
      if (customKeyword) params2.set("shorturl", customKeyword);

      const res = await fetch(`https://is.gd/create.php?${params2.toString()}`, {
        signal: AbortSignal.timeout(15_000),
      });
      const data = await res.json();

      if (data.errorcode) {
        return { success: false, error: `is.gd error (${data.errorcode}): ${data.errormessage}` };
      }
      if (!data.shorturl) {
        return { success: false, error: "is.gd رجّع استجابة غير متوقعة" };
      }

      return {
        success: true,
        data: {
          originalUrl: url,
          shortUrl: data.shorturl,
          keyword: customKeyword || data.shorturl.replace(/^https?:\/\/is\.gd\//i, ""),
          statsEnabled: logStats,
          shortenedAt: new Date().toISOString(),
        },
      };
    } catch (e: any) {
      return { success: false, error: `URL shorten error: ${e.message}` };
    }
  },
};
