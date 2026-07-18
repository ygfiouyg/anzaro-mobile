/**
 * MCP Tool: npm Package Versions
 * تكامل حقيقي مع npm registry API — كل versions لأي package.
 */
import type { MCPTool } from "../types";

export const npmVersionsTool: MCPTool = {
  name: "npm_versions",
  description: "كل versions لأي npm package (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'npm versions' أو 'نسخ npm'.",
  parameters: {
    type: "object",
    properties: {
      name: { type: "string", description: "اسم الـ package" },
      count: { type: "number", description: "عدد النسخ الأخيرة (افتراضي: 20، أقصى: 100)", default: 20 },
    },
    required: ["name"],
  },
  async execute(params) {
    const name = String(params.name || "").trim();
    const count = Math.min(100, Math.max(1, Number(params.count) || 20));

    if (!name) return { success: false, error: "name مطلوب" };

    try {
      const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`, {
        headers: { Accept: "application/json", "User-Agent": "DeltaAI-MCP/1.0" },
        signal: AbortSignal.timeout(15000),
      });

      if (res.status === 404) return { success: false, error: `الـ package "${name}" مش موجود` };
      if (!res.ok) return { success: false, error: `npm registry error ${res.status}` };

      const data: any = await res.json();
      const allVersions = Object.keys(data.versions || {});
      const time = data.time || {};

      // آخر count نسخ
      const recentVersions = allVersions.slice(-count).reverse().map((v) => ({
        version: v,
        published: time[v] || null,
        age_days: time[v] ? Math.floor((Date.now() - new Date(time[v]).getTime()) / 86400000) : null,
      }));

      // beta/alpha versions
      const prereleases = allVersions.filter((v) => /beta|alpha|rc|next|canary/i.test(v));
      const stable = allVersions.filter((v) => !/beta|alpha|rc|next|canary/i.test(v));

      return {
        success: true,
        data: {
          name: data.name || name,
          latest: data["dist-tags"]?.latest || "",
          next: data["dist-tags"]?.next || null,
          beta: data["dist-tags"]?.beta || null,
          total_versions: allVersions.length,
          stable_versions: stable.length,
          prerelease_versions: prereleases.length,
          recent_versions: recentVersions,
          first_version: allVersions[0] || null,
          first_published: time.created || null,
          last_published: time.modified || null,
          latest_published: time[data["dist-tags"]?.latest] || null,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
