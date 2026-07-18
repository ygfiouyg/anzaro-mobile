/**
 * MCP Tool: Domain Availability Check
 * بيتحقق لو domain متاح للتسجيل (RDAP — لو مفيش response = متاح).
 */
import type { MCPTool } from "../types";

export const domainAvailableTool: MCPTool = {
  name: "domain_available",
  description: "تحقق من توفر domain للتسجيل (RDAP حقيقي). استخدمها لما المستخدم يقول 'domain available' أو 'هل الـ domain متاح'.",
  parameters: {
    type: "object",
    properties: {
      domain: { type: "string", description: "اسم الـ domain للفحص" },
    },
    required: ["domain"],
  },
  async execute(params) {
    const domain = String(params.domain || "").trim().toLowerCase();
    if (!domain) return { success: false, error: "domain مطلوب" };
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)) {
      return { success: false, error: "صيغة domain غير صحيحة" };
    }

    try {
      const start = Date.now();
      const url = `https://rdap.org/domain/${encodeURIComponent(domain)}`;
      const res = await fetch(url, {
        headers: { Accept: "application/rdap+json", "User-Agent": "DeltaAI-MCP/1.0" },
        signal: AbortSignal.timeout(15000),
      });

      if (res.status === 404) {
        // domain مش مسجل → متاح
        return {
          success: true,
          data: {
            domain,
            available: true,
            registered: false,
            message: `✓ الـ domain "${domain}" متاح للتسجيل`,
            duration_ms: Date.now() - start,
            source: "rdap.org",
          },
        };
      }

      if (res.ok) {
        // domain مسجل → مش متاح
        const data: any = await res.json();
        const events: any[] = data.events || [];
        const registration = events.find((e) => e.eventAction === "registration");
        const expiration = events.find((e) => e.eventAction === "expiration");

        return {
          success: true,
          data: {
            domain,
            available: false,
            registered: true,
            message: `✗ الـ domain "${domain}" مسجل بالفعل`,
            registration_date: registration?.eventDate || null,
            expiration_date: expiration?.eventDate || null,
            status: data.status || [],
            duration_ms: Date.now() - start,
            source: "rdap.org",
          },
        };
      }

      // other errors
      return {
        success: false,
        error: `RDAP check failed: HTTP ${res.status}`,
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
