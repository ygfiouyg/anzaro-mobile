/**
 * MCP Tool: GitHub User Profile
 * تكامل حقيقي مع GitHub REST API — معلومات أي user.
 * GITHUB_TOKEN اختياري (يرفع rate limit من 60 لـ 5000/ساعة).
 */
import type { MCPTool } from "../types";

export const githubUserTool: MCPTool = {
  name: "github_user",
  description: "معلومات GitHub user profile (API حقيقي). استخدمها لما المستخدم يقول 'github user' أو 'بروفايل github'.",
  parameters: {
    type: "object",
    properties: {
      username: { type: "string", description: "اسم المستخدم على GitHub" },
    },
    required: ["username"],
  },
  async execute(params) {
    const username = String(params.username || "").trim();
    if (!username) return { success: false, error: "username مطلوب" };
    if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/.test(username)) {
      return { success: false, error: "صيغة username غير صحيحة" };
    }

    try {
      const token = process.env.GITHUB_TOKEN || "";
      const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "User-Agent": "DeltaAI-MCP/1.0",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const res = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, {
        headers,
        signal: AbortSignal.timeout(10000),
      });

      if (res.status === 404) {
        return { success: false, error: `المستخدم "${username}" مش موجود على GitHub` };
      }
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        return { success: false, error: `GitHub API error ${res.status}: ${errText.slice(0, 200)}` };
      }

      const data: any = await res.json();

      // نجيب عدد repos + top repos
      let topRepos: any[] = [];
      try {
        const reposRes = await fetch(
          `https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=stars&per_page=5&type=owner`,
          { headers, signal: AbortSignal.timeout(10000) }
        );
        if (reposRes.ok) {
          const repos: any[] = await reposRes.json();
          topRepos = repos.map((r) => ({
            name: r.name,
            full_name: r.full_name,
            url: r.html_url,
            description: r.description || "",
            stars: r.stargazers_count || 0,
            forks: r.forks_count || 0,
            language: r.language || "N/A",
          }));
        }
      } catch {}

      return {
        success: true,
        data: {
          login: data.login,
          id: data.id,
          node_id: data.node_id,
          name: data.name || data.login,
          company: data.company || null,
          blog: data.blog || null,
          location: data.location || null,
          email: data.email || null,
          bio: data.bio || null,
          twitter_username: data.twitter_username || null,
          public_repos: data.public_repos || 0,
          public_gists: data.public_gists || 0,
          followers: data.followers || 0,
          following: data.following || 0,
          created_at: data.created_at || "",
          updated_at: data.updated_at || "",
          avatar_url: data.avatar_url || "",
          html_url: data.html_url || "",
          type: data.type || "User",
          hireable: data.hireable,
          top_repos: topRepos,
          rate_limit_remaining: res.headers.get("x-ratelimit-remaining") || "?",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
