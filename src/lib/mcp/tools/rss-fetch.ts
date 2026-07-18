/**
 * MCP Tool — RSS Fetch
 * ====================
 * قراءة RSS feed من URL وتحويله لـ JSON (title, link, description, pubDate).
 * بيستخدم fetch مباشر + regex parsing (بدون أي dependency).
 */
import type { MCPTool } from "../types";

interface RSSItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  guid?: string;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

export const rssFetchTool: MCPTool = {
  name: "rss_fetch",
  description:
    "Fetch and parse an RSS / Atom feed from a URL. Returns feed metadata (title, description) and a list of items (title, link, description, pubDate). No API key needed.",
  parameters: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The RSS feed URL (e.g. 'https://feeds.bbci.co.uk/news/rss.xml').",
      },
      maxItems: {
        type: "number",
        description: "Maximum number of items to return. Default 10.",
        default: 10,
      },
    },
    required: ["url"],
  },
  async execute(params) {
    const url = String(params.url || "").trim();
    const maxItems = Math.max(1, Math.min(100, Number(params.maxItems) || 10));

    if (!url) {
      return { success: false, error: "url مطلوبة" };
    }
    if (!/^https?:\/\//i.test(url)) {
      return { success: false, error: "url لازم تبدأ بـ http:// أو https://" };
    }

    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
          Accept: "application/rss+xml, application/xml, text/xml, */*",
        },
        signal: AbortSignal.timeout(20_000),
      });

      if (!res.ok) {
        return { success: false, error: `فشل تحميل الـ feed (HTTP ${res.status})` };
      }

      const xml = await res.text();
      if (!xml || xml.length < 50) {
        return { success: false, error: "الـ feed فارغ أو غير صالح" };
      }

      // ── feed metadata ──
      let feedTitle = "";
      let feedDescription = "";
      let feedLink = "";

      const channelMatch = xml.match(/<channel[^>]*>([\s\S]*?)<\/channel>/i);
      if (channelMatch) {
        const ch = channelMatch[1];
        feedTitle = decodeEntities(stripTags((ch.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || ""));
        feedDescription = decodeEntities(stripTags((ch.match(/<description[^>]*>([\s\S]*?)<\/description>/i) || [])[1] || ""));
        const linkMatch = ch.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
        if (linkMatch) feedLink = decodeEntities(linkMatch[1].trim());
      } else {
        // Atom feed
        feedTitle = decodeEntities(stripTags((xml.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || ""));
        const subMatch = xml.match(/<subtitle[^>]*>([\s\S]*?)<\/subtitle>/i);
        if (subMatch) feedDescription = decodeEntities(stripTags(subMatch[1]));
      }

      // ── items (RSS 2.0 <item> or Atom <entry>) ──
      const items: RSSItem[] = [];
      const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
      let m: RegExpExecArray | null;
      while ((m = itemRegex.exec(xml)) !== null && items.length < maxItems) {
        const block = m[1];
        const title = decodeEntities(stripTags((block.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || ""));
        const link = decodeEntities((block.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || [])[1]?.trim() || "");
        const desc = decodeEntities(stripTags((block.match(/<description[^>]*>([\s\S]*?)<\/description>/i) || [])[1] || ""));
        const pub = decodeEntities(stripTags((block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) || [])[1] || ""));
        const guid = decodeEntities(stripTags((block.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i) || [])[1] || ""));
        if (title || link) {
          items.push({ title, link, description: desc, pubDate: pub, guid: guid || undefined });
        }
      }

      // Atom fallback
      if (items.length === 0) {
        const entryRegex = /<entry[^>]*>([\s\S]*?)<\/entry>/gi;
        while ((m = entryRegex.exec(xml)) !== null && items.length < maxItems) {
          const block = m[1];
          const title = decodeEntities(stripTags((block.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || ""));
          const linkMatch = block.match(/<link[^>]*href="([^"]+)"/i);
          const link = linkMatch ? linkMatch[1] : "";
          const desc = decodeEntities(stripTags((block.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i) || block.match(/<content[^>]*>([\s\S]*?)<\/content>/i) || [])[1] || ""));
          const pub = decodeEntities(stripTags((block.match(/<published[^>]*>([\s\S]*?)<\/published>/i) || block.match(/<updated[^>]*>([\s\S]*?)<\/updated>/i) || [])[1] || ""));
          if (title || link) items.push({ title, link, description: desc, pubDate: pub });
        }
      }

      return {
        success: true,
        data: {
          url,
          feed: {
            title: feedTitle,
            description: feedDescription,
            link: feedLink,
          },
          count: items.length,
          items,
        },
      };
    } catch (e: any) {
      return { success: false, error: `RSS fetch error: ${e.message}` };
    }
  },
};
