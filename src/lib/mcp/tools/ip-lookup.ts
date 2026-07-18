/**
 * MCP Tool: IP Lookup
 * تكامل حقيقي مع ipapi.co (مجاني، بدون API key).
 * بيرجّع معلومات جغرافية + ISP لأي IP.
 */
import type { MCPTool } from "../types";

export const ipLookupTool: MCPTool = {
  name: "ip_lookup",
  description: "معلومات جغرافية + ISP لأي IP (API حقيقي). استخدمها لما المستخدم يقول 'ip' أو 'IP lookup' أو 'موقع IP'.",
  parameters: {
    type: "object",
    properties: {
      ip: { type: "string", description: "عنوان IP (اتركه فاضي عشان IP بتاعك)" },
    },
    required: [],
  },
  async execute(params) {
    const ip = String(params.ip || "").trim();
    // تحقق بسيط من صحة IP (IPv4)
    if (ip && !/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
      return { success: false, error: "صيغة IP غير صحيحة (مثال: 8.8.8.8)" };
    }

    try {
      // ipapi.co مجاني (1000 طلب/يوم بدون key)
      const url = ip ? `https://ipapi.co/${ip}/json/` : `https://ipapi.co/json/`;
      const res = await fetch(url, {
        headers: { "User-Agent": "DeltaAI-MCP/1.0" },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        return { success: false, error: `IP API error ${res.status}` };
      }
      const data: any = await res.json();

      if (data.error) {
        return { success: false, error: data.reason || "IP lookup failed" };
      }

      return {
        success: true,
        data: {
          ip: data.ip || ip || "",
          city: data.city || "",
          region: data.region || "",
          country: data.country_name || "",
          country_code: data.country || "",
          postal: data.postal || "",
          latitude: data.latitude || 0,
          longitude: data.longitude || 0,
          timezone: data.timezone || "",
          isp: data.org || "",
          asn: data.asn || "",
          languages: data.languages || "",
          currency: data.currency || "",
          flag_url: data.country_code ? `https://flagcdn.com/w80/${(data.country_code || "").toLowerCase()}.png` : null,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
