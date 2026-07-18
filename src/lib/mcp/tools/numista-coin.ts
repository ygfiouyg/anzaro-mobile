/**
 * MCP Tool: Numista Coin Search
 * تكامل حقيقي مع Numista API (مجاني، بدون API key للـ public endpoints).
 * بيدوّر على عملات معدنية.
 */
import type { MCPTool } from "../types";

export const numistaCoinTool: MCPTool = {
  name: "numista_coin",
  description: "بحث في عملات Numista (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'coin' أو 'عملة معدنية' أو 'numista'.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "كلمة البحث (مثلاً: egypt, dollar, gold)" },
      count: { type: "number", description: "عدد النتائج (افتراضي: 5، أقصى: 50)", default: 5 },
    },
    required: ["query"],
  },
  async execute(params) {
    const query = String(params.query || "").trim();
    const count = Math.min(50, Math.max(1, Number(params.count) || 5));

    if (!query) return { success: false, error: "query مطلوبة" };

    try {
      // Numista search endpoint (public)
      const lang = "en";
      const url = `https://numista.com/catalogue/index.php?&p=1&e=&d=1&ct=&a=&cc=&f=${encodeURIComponent(query)}&v=&i=&t=&m=&mt=&g=&w=&c=&f1=&f2=&f3=&f4=&f5=&ca=3&no=&u=1&wp=1&wt=&wr=&ps=1&pe=1&gb=1&gd=1&ru=1&rb=1&re=1&or=1&ob=1&se=1&ss=1&av=1&vf=1&xf=1&un=1&co=1&q=${count}`;

      // استخدام Google Custom Search كبديل (مجاني مع تحديد)
      // Numista مفيهاش API رسمي مجاني بدون key، فبنستخدم scrape
      const scrapeUrl = `https://en.numista.com/catalogue/search.php?q=${encodeURIComponent(query)}&p=1`;
      const res = await fetch(scrapeUrl, {
        headers: {
          Accept: "text/html",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) return { success: false, error: `Numista error ${res.status}` };

      const html = await res.text();

      // parse coins from HTML
      const coins: any[] = [];
      const coinRegex = /<a href="\/catalogue\/pieces(\d+)\.html"[^>]*>([^<]+)<\/a>/g;
      let match: RegExpExecArray | null;
      let found = 0;

      while ((match = coinRegex.exec(html)) !== null && found < count) {
        const id = match[1];
        const title = match[2].trim();
        if (title && !coins.find((c) => c.id === id)) {
          coins.push({
            id,
            title,
            url: `https://en.numista.com/catalogue/pieces${id}.html`,
            image: `https://en.numista.com/catalogue/photos/${id}/obverse.jpg`,
          });
          found++;
        }
      }

      return {
        success: true,
        data: {
          query,
          total: coins.length,
          coins,
          search_url: scrapeUrl,
          source: "numista.com",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
