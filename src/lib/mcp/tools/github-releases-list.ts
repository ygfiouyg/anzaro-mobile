/**
 * MCP Tool: GitHub Releases List
 * تكامل حقيقي مع GitHub REST API — كل releases لأي repo.
 */
import type { MCPTool } from "../types";

export const githubReleasesListTool: MCPTool = {
  name: "github_releases_list",
  description: "كل releases لأي GitHub repo (API حقيقي). استخدمها لما المستخدم يقول 'releases list' أو 'كل الإصدارات'.",
  parameters: {
    type: "object",
    properties: {
      repo: { type: "string", description: "الـ repo بصيغة owner/name" },
      count: { type: "number", description: "عدد النتائج (افتراضي: 10، أقصى: 100)", default: 10 },
    },
    required: ["repo"],
  },
  async execute(params) {
    const repo = String(params.repo || "").trim();
    const count = Math.min(100, Math.max(1, Number(params.count) || 10));
    if (!repo) return { success: false, error: "repo مطلوب" };
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return { success: false, error: "repo بصيغة owner/name" };

    try {
      const token = process.env.GITHUB_TOKEN || "";
      const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "User-Agent": "DeltaAI-MCP/1.0",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=${count}`, {
        headers,
        signal: AbortSignal.timeout(10000),
      });

      if (res.status === 404) return { success: false, error: `الـ repo "${repo}" مش موجود` };
      if (!res.ok) return { success: false, error: `GitHub API error ${res.status}` };

      const data: any[] = await res.json();
      const releases = data.map((r: any) => ({
        id: r.id,
        tag: r.tag_name || "",
        name: r.name || r.tag_name || "",
        url: r.html_url || "",
        published: r.published_at || "",
        draft: r.draft || false,
        prerelease: r.prerelease || false,
        author: r.author?.login || "",
        body: (r.body || "").slice(0, 300),
        assets_count: (r.assets || []).length,
        total_downloads: (r.assets || []).reduce((s: number, a: any) => s + (a.download_count || 0), 0),
        assets: (r.assets || []).slice(0, 5).map((a: any) => ({
          name: a.name,
          size_mb: Math.round((a.size / 1048576) * 100) / 100,
          downloads: a.download_count,
          url: a.browser_download_url,
        })),
        zipball_url: r.zipball_url,
        tarball_url: r.tarball_url,
      }));

      return {
        success: true,
        data: {
          repo,
          total: releases.length,
          stable: releases.filter((r) => !r.prerelease && !r.draft).length,
          prereleases: releases.filter((r) => r.prerelease).length,
          drafts: releases.filter((r) => r.draft).length,
          latest: releases[0] || null,
          releases,
          rate_limit_remaining: res.headers.get("x-ratelimit-remaining") || "?",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
