/**
 * MCP Tool: GitHub Star Repo
 * تكامل حقيقي مع GitHub REST API — عمل star لأي repo.
 * محتاج GITHUB_TOKEN.
 */
import type { MCPTool } from "../types";

export const githubStarTool: MCPTool = {
  name: "github_star_repo",
  description: "عمل star لأي repo (API حقيقي، محتاج token). استخدمها لما المستخدم يقول 'star repo' أو 'اعمل star'.",
  parameters: {
    type: "object",
    properties: {
      repo: { type: "string", description: "الـ repo بصيغة owner/name" },
      unstar: { type: "boolean", description: "إزالة star (افتراضي: false)", default: false },
    },
    required: ["repo"],
  },
  async execute(params) {
    const repo = String(params.repo || "").trim();
    const unstar = Boolean(params.unstar);
    if (!repo) return { success: false, error: "repo مطلوب" };
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return { success: false, error: "repo بصيغة owner/name" };
    const token = process.env.GITHUB_TOKEN;
    if (!token) return { success: false, error: "GITHUB_TOKEN مطلوب" };
    try {
      const method = unstar ? "DELETE" : "PUT";
      const res = await fetch(`https://api.github.com/user/starred/${repo}`, {
        method,
        headers: { Accept: "application/vnd.github+json", "User-Agent": "DeltaAI-MCP/1.0", Authorization: `Bearer ${token}`, "Content-Length": "0" },
        signal: AbortSignal.timeout(10000),
      });
      if (res.status === 204) return { success: true, data: { repo, action: unstar ? "unstarred" : "starred", message: unstar ? `تم إزالة star من ${repo}` : `تم عمل star لـ ${repo}` } };
      if (!res.ok) return { success: false, error: `GitHub API error ${res.status}` };
      return { success: true, data: { repo, action: unstar ? "unstarred" : "starred" } };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
