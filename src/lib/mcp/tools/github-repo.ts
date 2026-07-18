/**
 * MCP Tool: GitHub Repo Info
 * تكامل حقيقي مع GitHub REST API — معلومات أي repository.
 */
import type { MCPTool } from "../types";

export const githubRepoTool: MCPTool = {
  name: "github_repo",
  description: "معلومات GitHub repository (API حقيقي). استخدمها لما المستخدم يقول 'repo info' أو 'تفاصيل repo'.",
  parameters: {
    type: "object",
    properties: {
      repo: { type: "string", description: "الـ repo بصيغة owner/name (مثلاً: facebook/react)" },
    },
    required: ["repo"],
  },
  async execute(params) {
    const repo = String(params.repo || "").trim();
    if (!repo) return { success: false, error: "repo مطلوبة (owner/name)" };
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
      return { success: false, error: "repo لازم يكون بصيغة owner/name" };
    }

    try {
      const token = process.env.GITHUB_TOKEN || "";
      const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "User-Agent": "DeltaAI-MCP/1.0",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const res = await fetch(`https://api.github.com/repos/${repo}`, {
        headers,
        signal: AbortSignal.timeout(10000),
      });

      if (res.status === 404) {
        return { success: false, error: `الـ repo "${repo}" مش موجود` };
      }
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        return { success: false, error: `GitHub API error ${res.status}: ${errText.slice(0, 200)}` };
      }

      const data: any = await res.json();

      // نجيب أحدث releases
      let latestRelease: any = null;
      try {
        const relRes = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
          headers,
          signal: AbortSignal.timeout(8000),
        });
        if (relRes.ok) {
          const rel: any = await relRes.json();
          latestRelease = {
            tag: rel.tag_name || "",
            name: rel.name || "",
            url: rel.html_url || "",
            published: rel.published_at || "",
            prerelease: rel.prerelease || false,
          };
        }
      } catch {}

      // نجيب languages
      let languages: string[] = [];
      try {
        const langRes = await fetch(`https://api.github.com/repos/${repo}/languages`, {
          headers,
          signal: AbortSignal.timeout(8000),
        });
        if (langRes.ok) {
          const langData: any = await langRes.json();
          languages = Object.keys(langData).slice(0, 10);
        }
      } catch {}

      return {
        success: true,
        data: {
          id: data.id,
          name: data.name,
          full_name: data.full_name,
          owner: {
            login: data.owner?.login || "",
            type: data.owner?.type || "",
            avatar: data.owner?.avatar_url || "",
          },
          description: data.description || "",
          url: data.html_url || "",
          homepage: data.homepage || null,
          language: data.language || "N/A",
          languages,
          size_kb: data.size || 0,
          default_branch: data.default_branch || "main",
          license: data.license
            ? { key: data.license.key, name: data.license.name, spdx_id: data.license.spdx_id }
            : null,
          stars: data.stargazers_count || 0,
          watchers: data.subscribers_count || 0,
          forks: data.forks_count || 0,
          open_issues: data.open_issues_count || 0,
          topics: data.topics || [],
          visibility: data.visibility || "public",
          fork: data.fork || false,
          archived: data.archived || false,
          disabled: data.disabled || false,
          created_at: data.created_at || "",
          updated_at: data.updated_at || "",
          pushed_at: data.pushed_at || "",
          clone_url: data.clone_url || "",
          ssh_url: data.ssh_url || "",
          latest_release: latestRelease,
          rate_limit_remaining: res.headers.get("x-ratelimit-remaining") || "?",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
