/**
 * MCP Tool: GitHub Repo Topics
 * تكامل حقيقي مع GitHub REST API — topics لأي repo.
 */
import type { MCPTool } from "../types";

export const githubRepoTopicsTool: MCPTool = {
  name: "github_repo_topics",
  description: "topics لأي GitHub repo (API حقيقي). استخدمها لما المستخدم يقول 'repo topics' أو 'وسوم repo'.",
  parameters: {
    type: "object",
    properties: {
      repo: { type: "string", description: "الـ repo بصيغة owner/name" },
    },
    required: ["repo"],
  },
  async execute(params) {
    const repo = String(params.repo || "").trim();

    if (!repo) return { success: false, error: "repo مطلوب" };
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return { success: false, error: "repo بصيغة owner/name" };

    try {
      const token = process.env.GITHUB_TOKEN || "";
      const headers: Record<string, string> = {
        Accept: "application/vnd.github.mercy-preview+json",
        "User-Agent": "DeltaAI-MCP/1.0",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const res = await fetch(`https://api.github.com/repos/${repo}/topics`, {
        headers,
        signal: AbortSignal.timeout(10000),
      });

      if (res.status === 404) return { success: false, error: `الـ repo "${repo}" مش موجود` };
      if (!res.ok) return { success: false, error: `GitHub API error ${res.status}` };

      const data: any = await res.json();
      const topics = (data.names || []).map((name: string) => ({
        name,
        url: `https://github.com/topics/${name}`,
      }));

      return {
        success: true,
        data: {
          repo,
          total_topics: topics.length,
          topics,
          rate_limit_remaining: res.headers.get("x-ratelimit-remaining") || "?",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
