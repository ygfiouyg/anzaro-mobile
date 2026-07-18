/**
 * MCP Tool: GitHub Gitignore Templates
 * تكامل حقيقي مع GitHub REST API — gitignore templates.
 */
import type { MCPTool } from "../types";

export const githubGitignoreTool: MCPTool = {
  name: "github_gitignore",
  description: "gitignore templates من GitHub (API حقيقي). استخدمها لما المستخدم يقول 'gitignore' أو 'تجاهل ملفات'.",
  parameters: {
    type: "object",
    properties: {
      name: { type: "string", description: "اسم الـ template (اختياري، مثلاً: Node, Python)" },
    },
    required: [],
  },
  async execute(params) {
    const name = String(params.name || "").trim();

    try {
      const token = process.env.GITHUB_TOKEN || "";
      const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "User-Agent": "DeltaAI-MCP/1.0",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      if (name) {
        // get specific template
        const res = await fetch(`https://api.github.com/gitignore/templates/${encodeURIComponent(name)}`, {
          headers,
          signal: AbortSignal.timeout(10000),
        });

        if (res.status === 404) {
          // try case-insensitive search
          const listRes = await fetch("https://api.github.com/gitignore/templates", { headers, signal: AbortSignal.timeout(10000) });
          if (listRes.ok) {
            const list: any[] = await listRes.json();
            const match = list.find((t) => t.toLowerCase() === name.toLowerCase());
            if (match) {
              const detailRes = await fetch(`https://api.github.com/gitignore/templates/${match}`, { headers, signal: AbortSignal.timeout(10000) });
              if (detailRes.ok) {
                const data: any = await detailRes.json();
                return {
                  success: true,
                  data: {
                    mode: "detail",
                    name: data.name,
                    source: data.source,
                    source_url: `https://github.com/github/gitignore/blob/main/${data.name}.gitignore`,
                    rate_limit_remaining: detailRes.headers.get("x-ratelimit-remaining") || "?",
                  },
                };
              }
            }
          }
          return { success: false, error: `template "${name}" مش موجود` };
        }
        if (!res.ok) return { success: false, error: `GitHub API error ${res.status}` };

        const data: any = await res.json();

        return {
          success: true,
          data: {
            mode: "detail",
            name: data.name,
            source: data.source,
            source_url: `https://github.com/github/gitignore/blob/main/${data.name}.gitignore`,
            rate_limit_remaining: res.headers.get("x-ratelimit-remaining") || "?",
          },
        };
      }

      // list all templates
      const res = await fetch("https://api.github.com/gitignore/templates", {
        headers,
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) return { success: false, error: `GitHub API error ${res.status}` };

      const data: any = await res.json();
      const templates = Array.isArray(data) ? data : [];

      // categorize
      const categories: Record<string, string[]> = {
        "Languages": [],
        "Frameworks": [],
        "OS": [],
        "Editors": [],
        "Other": [],
      };

      const langKeywords = ["C", "C++", "Java", "Python", "Ruby", "Go", "Rust", "Node", "Swift", "Kotlin", "Scala", "Perl", "PHP", "Haskell", "Clojure", "Elixir", "Erlang", "F#", "D", "Lua", "R", "Julia"];
      const frameworkKeywords = ["Rails", "Django", "Laravel", "React", "Vue", "Angular", "Next", "Nuxt", "Spring", "Symfony", "Unity", "Godot"];
      const osKeywords = ["Windows", "Linux", "macOS", "Android", "iOS"];
      const editorKeywords = ["JetBrains", "VisualStudio", "VSCode", "Sublime", "Vim", "Emacs", "Eclipse"];

      templates.forEach((t: string) => {
        if (langKeywords.some((k) => t.toLowerCase().includes(k.toLowerCase()))) {
          categories.Languages.push(t);
        } else if (frameworkKeywords.some((k) => t.toLowerCase().includes(k.toLowerCase()))) {
          categories.Frameworks.push(t);
        } else if (osKeywords.some((k) => t.toLowerCase().includes(k.toLowerCase()))) {
          categories.OS.push(t);
        } else if (editorKeywords.some((k) => t.toLowerCase().includes(k.toLowerCase()))) {
          categories.Editors.push(t);
        } else {
          categories.Other.push(t);
        }
      });

      return {
        success: true,
        data: {
          mode: "list",
          total: templates.length,
          templates,
          categories,
          rate_limit_remaining: res.headers.get("x-ratelimit-remaining") || "?",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
