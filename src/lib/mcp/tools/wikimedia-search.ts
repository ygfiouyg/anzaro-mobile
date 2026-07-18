/**
 * MCP Tool: Wikimedia Commons Search
 * تكامل حقيقي مع Wikimedia Commons API (مجاني، بدون API key).
 * بيدوّر على صور + media files.
 */
import type { MCPTool } from "../types";

export const wikimediaSearchTool: MCPTool = {
  name: "wikimedia_search",
  description: "ابحث في Wikimedia Commons عن صور (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'صور ويكيميديا' أو 'wikimedia'.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "كلمة البحث" },
      count: { type: "number", description: "عدد النتائج (افتراضي: 5، أقصى: 50)", default: 5 },
      mediaType: { type: "string", description: "bitmap, drawing, audio, video, 3d, office (افتراضي: bitmap)", default: "bitmap" },
    },
    required: ["query"],
  },
  async execute(params) {
    const query = String(params.query || "").trim();
    const count = Math.min(50, Math.max(1, Number(params.count) || 5));
    const mediaType = String(params.mediaType || "bitmap").toLowerCase();

    if (!query) return { success: false, error: "query مطلوبة" };

    try {
      const params2 = new URLSearchParams({
        action: "query",
        format: "json",
        generator: "search",
        gsrsearch: `filetype:${mediaType} ${query}`,
        gsrnamespace: "6",
        gsrlimit: String(count),
        prop: "imageinfo",
        iiprop: "url|size|mime|extmetadata|user|timestamp",
        iiurlwidth: "400",
        origin: "*",
      });

      const url = `https://commons.wikimedia.org/w/api.php?${params2.toString()}`;
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "DeltaAI-MCP/1.0" },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) return { success: false, error: `Wikimedia API error ${res.status}` };

      const data: any = await res.json();
      const pages = data.query?.pages || {};
      const results = Object.values(pages).map((p: any) => {
        const info = p.imageinfo?.[0] || {};
        const meta = info.extmetadata || {};
        return {
          title: p.title || "",
          page_id: p.pageid,
          url: info.url || "",
          thumb_url: info.thumburl || "",
          thumb_width: info.thumbwidth || 0,
          thumb_height: info.thumbheight || 0,
          width: info.width || 0,
          height: info.height || 0,
          size_bytes: info.size || 0,
          mime: info.mime || "",
          user: info.user || "",
          timestamp: info.timestamp || "",
          description: meta.ImageDescription?.value || "",
          license: meta.License?.value || "",
          license_url: meta.LicenseUrl?.value || "",
          author: meta.Artist?.value || "",
          source: meta.Credit?.value || "",
        };
      });

      return {
        success: true,
        data: {
          query,
          media_type: mediaType,
          total: results.length,
          results,
          source: "commons.wikimedia.org",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
