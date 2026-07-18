/**
 * MCP Tool: WHOIS Lookup
 * تكامل حقيقي مع RDAP API (مجاني تماماً، بدون API key).
 * بيرجّع معلومات تسجيل أي domain (registrar, dates, nameservers).
 *
 * RDAP هو خليفة WHOIS — بيرجّع JSON منظّم بدل نص خام.
 */
import type { MCPTool } from "../types";

export const whoisLookupTool: MCPTool = {
  name: "whois_lookup",
  description: "معلومات تسجيل أي domain (WHOIS/RDAP حقيقي). استخدمها لما المستخدم يقول 'whois' أو 'تسجيل domain' أو 'مين مالك الموقع'.",
  parameters: {
    type: "object",
    properties: {
      domain: { type: "string", description: "اسم الـ domain (مثلاً: google.com)" },
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
      // RDAP bootstrap: نحدد الـ TLD ونجيب الـ RDAP server
      const tld = domain.split(".").pop() || "";
      // نستخدم rdap.org كبوابة (بيحوّل تلقائياً)
      const url = `https://rdap.org/domain/${encodeURIComponent(domain)}`;
      const res = await fetch(url, {
        headers: { Accept: "application/rdap+json", "User-Agent": "DeltaAI-MCP/1.0" },
        signal: AbortSignal.timeout(15000),
      });

      if (res.status === 404) {
        return { success: false, error: `الـ domain "${domain}" مش موجود أو مش مسجل` };
      }
      if (!res.ok) {
        return { success: false, error: `RDAP API error ${res.status}` };
      }

      const data: any = await res.json();

      // استخراج events (registration, expiration, last update)
      const events: any[] = data.events || [];
      const registration = events.find((e) => e.eventAction === "registration");
      const expiration = events.find((e) => e.eventAction === "expiration");
      const lastChanged = events.find((e) => e.eventAction === "last changed");

      // استخراج entities (registrar, registrant, admin, tech)
      const entities: any[] = data.entities || [];
      const registrar = entities.find((e) =>
        (e.roles || []).includes("registrar")
      );
      const registrant = entities.find((e) =>
        (e.roles || []).includes("registrant")
      );

      // استخراج nameservers
      const nameservers: string[] = (data.nameservers || []).map((ns: any) => ns.ldhName || "");

      // استخراج status
      const status: string[] = data.status || [];

      // استخراج secureDNS
      const secureDns = data.secureDNS || {};

      return {
        success: true,
        data: {
          domain,
          ldh_name: data.ldhName || domain,
          unicode_name: data.unicodeName || domain,
          status,
          registered: !!registration,
          registration_date: registration?.eventDate || null,
          expiration_date: expiration?.eventDate || null,
          last_updated: lastChanged?.eventDate || null,
          registrar: registrar
            ? {
                name: registrar.vcardArray?.[1]?.find((v: any) => v[0] === "fn")?.[3] || "",
                handle: registrar.handle || "",
              }
            : null,
          registrant: registrant
            ? {
                name: registrant.vcardArray?.[1]?.find((v: any) => v[0] === "fn")?.[3] || "",
                email: registrant.vcardArray?.[1]?.find((v: any) => v[0] === "email")?.[3] || "",
              }
            : null,
          nameservers,
          nameservers_count: nameservers.length,
          secure_dns: {
            delegation_signed: secureDns.delegationSigned || false,
            zone_signed: secureDns.zoneSigned || false,
          },
          rdap_conformance: data.rdapConformance || [],
          notices: (data.notices || []).map((n: any) => ({
            title: n.title || "",
            description: (n.description || []).join(" "),
          })),
          source: "rdap.org",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
