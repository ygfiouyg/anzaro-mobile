/**
 * MCP Tool: GitHub Release Assets
 * تكامل حقيقي مع GitHub REST API — assets لأي release.
 */
import type { MCPTool } from "../types";

export const githubReleaseAssetsTool: MCPTool = {
  name: "github_release_assets",
  description: "assets لأي GitHub release (API حقيقي). استخدمها لما المستخدم يقول 'release assets' أو 'download files'.",
  parameters: {
    type: "object",
    properties: {
      repo: { type: "string", description: "الـ repo بصيغة owner/name" },
      releaseId: { type: "string", description: "ID الـ release (أو 'latest')" },
    },
    required: ["repo", "releaseId"],
  },
  async execute(params) {
    const repo = String(params.repo || "").trim();
    const releaseId = String(params.releaseId || "latest").trim();

    if (!repo) return { success: false, error: "repo مطلوب" };
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return { success: false, error: "repo بصيغة owner/name" };

    try {
      const token = process.env.GITHUB_TOKEN || "";
      const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "User-Agent": "DeltaAI-MCP/1.0",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const endpoint = releaseId === "latest"
        ? `https://api.github.com/repos/${repo}/releases/latest`
        : `https://api.github.com/repos/${repo}/releases/${releaseId}`;

      const res = await fetch(endpoint, {
        headers,
        signal: AbortSignal.timeout(10000),
      });

      if (res.status === 404) return { success: false, error: `الـ release مش موجود` };
      if (!res.ok) return { success: false, error: `GitHub API error ${res.status}` };

      const data: any = await res.json();
      const assets = (data.assets || []).map((a: any) => ({
        id: a.id,
        name: a.name,
        size: a.size,
        size_mb: Math.round((a.size / 1048576) * 100) / 100,
        download_count: a.download_count,
        download_url: a.browser_download_url,
        api_url: a.url,
        content_type: a.content_type,
        created: a.created_at,
        updated: a.updated_at,
        label: a.label || null,
      }));

      const totalDownloads = assets.reduce((s: number, a: any) => s + a.download_count, 0);
      const totalSize = assets.reduce((s: number, a: any) => s + a.size, 0);

      return {
        success: true,
        data: {
          repo,
          release: {
            id: data.id,
            tag: data.tag_name,
            name: data.name || data.tag_name,
            url: data.html_url,
            published: data.published_at,
            draft: data.draft,
            prerelease: data.prerelease,
            author: data.author?.login || "",
          },
          assets,
          assets_count: assets.length,
          total_downloads: totalDownloads,
          total_size_mb: Math.round((totalSize / 1048576) * 100) / 100,
          top_downloaded: [...assets].sort((a: any, b: any) => b.download_count - a.download_count)[0] || null,
          source_code: {
            zip: data.zipball_url,
            tar: data.tarball_url,
          },
          rate_limit_remaining: res.headers.get("x-ratelimit-remaining") || "?",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
