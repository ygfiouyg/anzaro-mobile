/**
 * MCP Tool: GitHub Licenses
 * تكامل حقيقي مع GitHub REST API — كل licenses المدعومة + تفاصيلها.
 */
import type { MCPTool } from "../types";

export const githubLicensesTool: MCPTool = {
  name: "github_licenses",
  description: "كل licenses المدعومة في GitHub (API حقيقي). استخدمها لما المستخدم يقول 'licenses' أو 'تراخيص' أو 'license info'.",
  parameters: {
    type: "object",
    properties: {
      license: { type: "string", description: "license key محدد للتفاصيل (اختياري، مثلاً: mit)" },
    },
    required: [],
  },
  async execute(params) {
    const license = String(params.license || "").trim().toLowerCase();

    try {
      const token = process.env.GITHUB_TOKEN || "";
      const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "User-Agent": "DeltaAI-MCP/1.0",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      if (license) {
        // تفاصيل license محدد
        const res = await fetch(`https://api.github.com/licenses/${encodeURIComponent(license)}`, {
          headers,
          signal: AbortSignal.timeout(10000),
        });

        if (res.status === 404) return { success: false, error: `الـ license "${license}" مش موجود` };
        if (!res.ok) return { success: false, error: `GitHub API error ${res.status}` };

        const data: any = await res.json();

        return {
          success: true,
          data: {
            mode: "detail",
            key: data.key,
            name: data.name,
            spdx_id: data.spdx_id,
            url: data.html_url,
            description: data.description || "",
            implementation: data.implementation || "",
            permissions: data.permissions || [],
            conditions: data.conditions || [],
            limitations: data.limitations || [],
            body: (data.body || "").slice(0, 5000),
            featured: data.featured || false,
            rate_limit_remaining: res.headers.get("x-ratelimit-remaining") || "?",
          },
        };
      }

      // كل licenses
      const res = await fetch("https://api.github.com/licenses", {
        headers,
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) return { success: false, error: `GitHub API error ${res.status}` };

      const data: any[] = await res.json();
      const licenses = data.map((l: any) => ({
        key: l.key,
        name: l.name,
        spdx_id: l.spdx_id,
        url: l.html_url,
        featured: l.featured || false,
      }));

      return {
        success: true,
        data: {
          mode: "list",
          total: licenses.length,
          featured: licenses.filter((l) => l.featured).map((l) => l.name),
          licenses,
          rate_limit_remaining: res.headers.get("x-ratelimit-remaining") || "?",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
