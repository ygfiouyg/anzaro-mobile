/**
 * MCP Tool: npm Package Info
 * تكامل حقيقي مع npm registry API (مجاني تماماً، بدون API key).
 * بيرجّع معلومات + versions + dependencies لأي package.
 */
import type { MCPTool } from "../types";

export const npmPackageTool: MCPTool = {
  name: "npm_package",
  description: "معلومات npm package (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'npm' أو 'package' أو 'حزمة'.",
  parameters: {
    type: "object",
    properties: {
      name: { type: "string", description: "اسم الـ package (مثلاً: react, next, express)" },
      version: { type: "string", description: "نسخة محددة (افتراضي: latest)" },
    },
    required: ["name"],
  },
  async execute(params) {
    const name = String(params.name || "").trim();
    const version = String(params.version || "latest").trim();
    if (!name) return { success: false, error: "name مطلوب" };
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._@/-]*$/.test(name)) {
      return { success: false, error: "صيغة اسم الـ package غير صحيحة" };
    }

    try {
      // npm registry API
      const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`, {
        headers: { Accept: "application/json", "User-Agent": "DeltaAI-MCP/1.0" },
        signal: AbortSignal.timeout(15000),
      });

      if (res.status === 404) {
        return { success: false, error: `الـ package "${name}" مش موجود على npm` };
      }
      if (!res.ok) {
        return { success: false, error: `npm registry error ${res.status}` };
      }

      const data: any = await res.json();
      const latestVersion = data["dist-tags"]?.latest || "";
      const targetVersion = version === "latest" ? latestVersion : version;
      const versionData = data.versions?.[targetVersion] || data.versions?.[latestVersion] || {};

      const time = data.time || {};

      // إحصائيات
      const allVersions = Object.keys(data.versions || {});
      const dependencies = versionData.dependencies || {};
      const devDependencies = versionData.devDependencies || {};
      const peerDependencies = versionData.peerDependencies || {};

      // download stats (آخر أسبوع)
      let downloads: any = null;
      try {
        const dlRes = await fetch(
          `https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(name)}`,
          { signal: AbortSignal.timeout(8000) }
        );
        if (dlRes.ok) {
          downloads = await dlRes.json();
        }
      } catch {}

      return {
        success: true,
        data: {
          name: data.name || name,
          version: targetVersion,
          latest_version: latestVersion,
          description: data.description || versionData.description || "",
          homepage: data.homepage || versionData.homepage || null,
          repository: typeof data.repository === "string" ? data.repository : data.repository?.url || null,
          bugs: typeof data.bugs === "string" ? data.bugs : data.bugs?.url || null,
          license: data.license || versionData.license || null,
          keywords: data.keywords || [],
          maintainers: (data.maintainers || []).map((m: any) => ({
            name: m.name || "",
            email: m.email || "",
          })),
          author: typeof data.author === "string" ? data.author : data.author?.name || null,
          versions_count: allVersions.length,
          versions: allVersions.slice(-10), // آخر 10 versions
          created: time.created || "",
          modified: time.modified || "",
          target_version_published: time[targetVersion] || "",
          dependencies,
          dev_dependencies: devDependencies,
          peer_dependencies: peerDependencies,
          bin: versionData.bin || null,
          engines: versionData.engines || null,
          os: versionData.os || null,
          cpu: versionData.cpu || null,
          dist: versionData.dist
            ? {
                shasum: versionData.dist.shasum || "",
                tarball: versionData.dist.tarball || "",
                size: versionData.dist.unpackedSize || null,
                integrity: versionData.dist.integrity || "",
              }
            : null,
          downloads_last_week: downloads?.downloads || null,
          downloads_start: downloads?.start || null,
          downloads_end: downloads?.end || null,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
