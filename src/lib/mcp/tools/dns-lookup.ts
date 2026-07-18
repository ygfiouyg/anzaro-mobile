/**
 * MCP Tool: DNS Lookup
 * تكامل حقيقي مع Cloudflare DNS-over-HTTPS (مجاني تماماً، بدون API key).
 * بيرجّع DNS records لأي domain.
 */
import type { MCPTool } from "../types";

export const dnsLookupTool: MCPTool = {
  name: "dns_lookup",
  description: "DNS records لأي domain (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'dns' أو 'domain' أو 'سجلات dns'.",
  parameters: {
    type: "object",
    properties: {
      domain: { type: "string", description: "اسم الـ domain (مثلاً: example.com)" },
      type: {
        type: "string",
        description: "نوع السجل: A, AAAA, MX, NS, TXT, CNAME, SOA, SRV, CAA, any (افتراضي: A)",
        default: "A",
      },
    },
    required: ["domain"],
  },
  async execute(params) {
    const domain = String(params.domain || "").trim().toLowerCase();
    const type = String(params.type || "A").toUpperCase().trim();
    if (!domain) return { success: false, error: "domain مطلوب" };
    // تحقق بسيط من صحة الـ domain
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)) {
      return { success: false, error: "صيغة domain غير صحيحة" };
    }

    const validTypes = ["A", "AAAA", "MX", "NS", "TXT", "CNAME", "SOA", "SRV", "CAA", "ANY"];
    const selType = validTypes.includes(type) ? type : "A";

    try {
      // Cloudflare DNS-over-HTTPS
      const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=${selType}`;
      const res = await fetch(url, {
        headers: { Accept: "application/dns-json", "User-Agent": "DeltaAI-MCP/1.0" },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        return { success: false, error: `Cloudflare DoH error ${res.status}` };
      }

      const data: any = await res.json();
      const answers: any[] = Array.isArray(data.Answer) ? data.Answer : [];

      // لو type=ANY، نعمل queries متعددة
      if (selType === "ANY") {
        const types = ["A", "AAAA", "MX", "NS", "TXT", "CNAME", "SOA"];
        const allResults: any[] = [];
        for (const t of types) {
          try {
            const r = await fetch(
              `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=${t}`,
              { headers: { Accept: "application/dns-json" }, signal: AbortSignal.timeout(5000) }
            );
            if (r.ok) {
              const d: any = await r.json();
              if (Array.isArray(d.Answer)) {
                allResults.push(...d.Answer);
              }
            }
          } catch {}
        }

        const grouped: Record<string, any[]> = {};
        for (const a of allResults) {
          const typeName = typeNumberToName(a.type);
          if (!grouped[typeName]) grouped[typeName] = [];
          grouped[typeName].push({
            name: a.name,
            type: typeName,
            ttl: a.TTL,
            data: a.data,
          });
        }

        return {
          success: true,
          data: {
            domain,
            type: "ANY",
            status: data.Status,
            status_text: dnsStatusText(data.Status),
            records_by_type: grouped,
            total_records: allResults.length,
            source: "cloudflare-dns.com",
          },
        };
      }

      const records = answers.map((a: any) => ({
        name: a.name,
        type: typeNumberToName(a.type),
        ttl: a.TTL,
        data: a.data,
      }));

      return {
        success: true,
        data: {
          domain,
          type: selType,
          status: data.Status,
          status_text: dnsStatusText(data.Status),
          records,
          count: records.length,
          authoritative: data.Authoritative || false,
          source: "cloudflare-dns.com",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};

function typeNumberToName(num: number): string {
  const map: Record<number, string> = {
    1: "A",
    2: "NS",
    5: "CNAME",
    6: "SOA",
    15: "MX",
    16: "TXT",
    28: "AAAA",
    33: "SRV",
    257: "CAA",
  };
  return map[num] || `TYPE${num}`;
}

function dnsStatusText(status: number): string {
  const map: Record<number, string> = {
    0: "NOERROR",
    1: "FORMERR",
    2: "SERVFAIL",
    3: "NXDOMAIN",
    4: "NOTIMP",
    5: "REFUSED",
  };
  return map[status] || `STATUS${status}`;
}
