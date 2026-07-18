/**
 * MCP Tool: GitHub Tags & Releases
 * تكامل حقيقي مع GitHub REST API — tags + releases لأي repo.
 */
import type { MCPTool } from "../types";

export const githubTagsTool: MCPTool = {
  name: "github_tags",
  description: "tags و releases لأي GitHub repo (API حقيقي). استخدمها لما المستخدم يقول 'tags' أو 'releases' أو 'إصدارات'.",
  parameters: {
    type: "object",
    properties: {
      repo: { type: "string", description: "الـ repo بصيغة owner/name" },
      count: { type: "number", description: "عدد النتائج (افتراضي: 10)", default: 10 },
    },
    required: ["repo"],
  },
  async execute(params) {
    const repo = String(params.repo || "").trim();
    const count = Math.min(50, Math.max(1, Number(params.count) || 10));
    if (!repo) return { success: false, error: "repo مطلوب" };
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return { success: false, error: "repo بصيغة owner/name" };

    try {
      const token = process.env.GITHUB_TOKEN || "";
      const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "User-Agent": "DeltaAI-MCP/1.0",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      // fetch tags + releases in parallel
      const [tagsRes, releasesRes] = await Promise.all([
        fetch(`https://api.github.com/repos/${repo}/tags?per_page=${count}`, { headers, signal: AbortSignal.timeout(10000) }),
        fetch(`https://api.github.com/repos/${repo}/releases?per_page=${count}`, { headers, signal: AbortSignal.timeout(10000) }),
      ]);

      if (tagsRes.status === 404) return { success: false, error: `الـ repo "${repo}" مش موجود` };

      const tagsData: any[] = tagsRes.ok ? await tagsRes.json() : [];
      const releasesData: any[] = releasesRes.ok ? await releasesRes.json() : [];

      const tags = tagsData.map((t: any) => ({
        name: t.name || "",
        commit_sha: t.commit?.sha?.slice(0, 7) || "",
        commit_url: t.commit?.url || "",
        zip_url: t.zipball_url || "",
        tar_url: t.tarball_url || "",
      }));

      const releases = releasesData.map((r: any) => ({
        id: r.id,
        tag: r.tag_name || "",
        name: r.name || r.tag_name || "",
        url: r.html_url || "",
        published: r.published_at || "",
        draft: r.draft || false,
        prerelease: r.prerelease || false,
        author: r.author?.login || "",
        body: (r.body || "").slice(0, 500),
        assets: (r.assets || []).map((a: any) => ({
          name: a.name,
          download_count: a.download_count,
          size: a.size,
          url: a.browser_download_url,
        })),
      }));

      return {
        success: true,
        data: {
          repo,
          tags_count: tags.length,
          releases_count: releases.length,
          latest_tag: tags[0]?.name || null,
          latest_release: releases[0] ? {
            tag: releases[0].tag,
            name: releases[0].name,
            url: releases[0].url,
            published: releases[0].published,
          } : null,
          tags,
          releases,
          rate_limit_remaining: tagsRes.headers.get("x-ratelimit-remaining") || "?",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
