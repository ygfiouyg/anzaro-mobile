/**
 * MCP Tool: GitHub Trending
 * بيعمل scrape لـ github.com/trending ويرجّع trending repos.
 * مفيش API رسمي لـ trending، فبنعمل scrape للـ HTML.
 */
import type { MCPTool } from "../types";

export const githubTrendingTool: MCPTool = {
  name: "github_trending",
  description: "trending repos على GitHub (scrape حقيقي). استخدمها لما المستخدم يقول 'trending' أو 'ترند' أو 'شائع'.",
  parameters: {
    type: "object",
    properties: {
      since: {
        type: "string",
        description: "الفترة: daily, weekly, monthly (افتراضي: weekly)",
        default: "weekly",
      },
      language: {
        type: "string",
        description: "لغة محددة (مثلاً: python, javascript, typescript). اختياري",
      },
      spoken_language: {
        type: "string",
        description: "لغة منطوقة (اختياري)",
      },
      count: { type: "number", description: "عدد النتائج (افتراضي: 10، أقصى: 25)", default: 10 },
    },
    required: [],
  },
  async execute(params) {
    const since = String(params.since || "weekly").toLowerCase();
    const language = String(params.language || "").toLowerCase().trim();
    const count = Math.min(25, Math.max(1, Number(params.count) || 10));

    const validSince = ["daily", "weekly", "monthly"].includes(since) ? since : "weekly";

    try {
      // بناء URL
      let url = `https://github.com/trending`;
      if (language) url += `/${encodeURIComponent(language)}`;
      const params2 = new URLSearchParams();
      params2.set("since", validSince);
      url += `?${params2.toString()}`;

      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        return { success: false, error: `GitHub trending error ${res.status}` };
      }

      const html = await res.text();

      // parse الـ repos من الـ HTML
      const repos: any[] = [];

      // pattern: <article class="Box-row">...</article>
      const articleRegex = /<article class="Box-row">([\s\S]*?)<\/article>/g;
      let match: RegExpExecArray | null;

      while ((match = articleRegex.exec(html)) !== null && repos.length < count) {
        const articleHtml = match[1];

        // استخراج الاسم + الرابط (href مم في أي مكان في الـ a tag)
        const nameMatch = articleHtml.match(/<h2[^>]*>[\s\S]*?<a [^>]*href="\/([^"]+)"[^>]*>/);
        const fullName = nameMatch ? nameMatch[1].trim() : "";

        // استخراج الوصف
        const descMatch = articleHtml.match(/<p[^>]*>([\s\S]*?)<\/p>/);
        const description = descMatch ? descMatch[1].replace(/<[^>]+>/g, "").trim() : "";

        // استخراج اللغة
        const langMatch = articleHtml.match(/itemprop="programmingLanguage">([^<]+)</);
        const lang = langMatch ? langMatch[1].trim() : "";

        // استخراج stars total
        const starsMatch = articleHtml.match(/href="\/[^"]+\/stargazers"[^>]*>[\s\S]*?([\d,]+)/);
        const stars = starsMatch ? parseInt(starsMatch[1].replace(/,/g, "")) : 0;

        // استخراج forks
        const forksMatch = articleHtml.match(/href="\/[^"]+\/forks"[^>]*>[\s\S]*?([\d,]+)/);
        const forks = forksMatch ? parseInt(forksMatch[1].replace(/,/g, "")) : 0;

        // استخراج stars في الفترة
        const starsTodayMatch = articleHtml.match(/([\d,]+)\s*stars?\s+(today|this week|this month)/i);
        const starsInPeriod = starsTodayMatch ? parseInt(starsTodayMatch[1].replace(/,/g, "")) : 0;

        if (fullName) {
          repos.push({
            name: fullName,
            url: `https://github.com/${fullName}`,
            description,
            language: lang || null,
            stars,
            forks,
            stars_in_period: starsInPeriod,
            period: validSince,
          });
        }
      }

      return {
        success: true,
        data: {
          since: validSince,
          language: language || "all",
          total: repos.length,
          repos,
          source: "github.com/trending",
          url,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
