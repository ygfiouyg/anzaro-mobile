/**
 * MCP Tool: Reverse DNS Lookup
 * بيحلّل IP لـ hostname (محلي، Node dns module).
 */
import type { MCPTool } from "../types";

export const reverseDnsTool: MCPTool = {
  name: "reverse_dns",
  description: "reverse DNS لأي IP (محلي). استخدمها لما المستخدم يقول 'reverse dns' أو 'hostname for ip'.",
  parameters: {
    type: "object",
    properties: {
      ip: { type: "string", description: "عنوان IP" },
    },
    required: ["ip"],
  },
  async execute(params) {
    const ip = String(params.ip || "").trim();
    if (!ip) return { success: false, error: "ip مطلوب" };
    if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ip) && !/^[0-9a-fA-F:]+$/.test(ip)) {
      return { success: false, error: "صيغة IP غير صحيحة" };
    }

    try {
      const start = Date.now();
      const dns = await import("dns");
      const dnsPromises = dns.promises;
      let hostnames: string[] = [];
      let error: string | null = null;

      try {
        hostnames = await dnsPromises.reverse(ip);
      } catch (e: any) {
        if (e.code === "ENOTFOUND") {
          error = "مفيش PTR record لهذا الـ IP";
        } else {
          error = e.message;
        }
      }

      // forward lookup للتأكيد
      let confirmed = false;
      if (hostnames.length > 0) {
        try {
          const addresses = await dnsPromises.resolve4(hostnames[0]);
          confirmed = addresses.includes(ip);
        } catch {}
      }

      return {
        success: true,
        data: {
          ip,
          hostnames,
          hostname_count: hostnames.length,
          primary_hostname: hostnames[0] || null,
          forward_confirmed: confirmed,
          error,
          duration_ms: Date.now() - start,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
