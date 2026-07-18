/**
 * MCP Tool: SSL Certificate Checker
 * بيرجّع معلومات SSL certificate لأي domain.
 * محلي — بيستخدم tls.connect مباشرة.
 */
import type { MCPTool } from "../types";

export const sslCertTool: MCPTool = {
  name: "ssl_cert",
  description: "فحص SSL certificate لأي domain (محلي). استخدمها لما المستخدم يقول 'ssl' أو 'certificate' أو 'شهادة أمان'.",
  parameters: {
    type: "object",
    properties: {
      domain: { type: "string", description: "اسم الـ domain (مثلاً: github.com)" },
      port: { type: "number", description: "المنفذ (افتراضي: 443)", default: 443 },
    },
    required: ["domain"],
  },
  async execute(params) {
    const domain = String(params.domain || "").trim().toLowerCase();
    const port = Number(params.port) || 443;

    if (!domain) return { success: false, error: "domain مطلوب" };
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)) {
      return { success: false, error: "صيغة domain غير صحيحة" };
    }

    try {
      const certInfo = await checkSSLCertificate(domain, port);
      return { success: true, data: certInfo };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};

function checkSSLCertificate(domain: string, port: number): Promise<any> {
  return new Promise(async (resolve, reject) => {
    const start = Date.now();
    const tls = await import("tls");
    const socket = tls.connect(
      {
        host: domain,
        port,
        servername: domain,
        rejectUnauthorized: false,
      },
      () => {
        const cert = socket.getPeerCertificate();
        const authorized = socket.authorized;
        const protocol = socket.getProtocol();
        const cipher = socket.getCipher();
        socket.end();
        socket.destroy();

        if (!cert || Object.keys(cert).length === 0) {
          reject(new Error("مفيش SSL certificate لهذا الـ domain"));
          return;
        }

        const now = new Date();
        const validFrom = new Date(cert.valid_from);
        const validTo = new Date(cert.valid_to);
        const daysRemaining = Math.floor((validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        const isExpired = now > validTo;
        const isExpiringSoon = daysRemaining <= 30 && daysRemaining > 0;

        resolve({
          domain,
          port,
          connected: true,
          duration_ms: Date.now() - start,
          valid: !isExpired,
          trusted: authorized,
          protocol,
          cipher: cipher
            ? {
                name: cipher.name,
                version: cipher.version,
                standard_name: cipher.standardName || null,
              }
            : null,
          subject: {
            CN: cert.subject?.CN || "",
            O: cert.subject?.O || "",
            OU: cert.subject?.OU || null,
            C: cert.subject?.C || null,
            ST: cert.subject?.ST || null,
            L: cert.subject?.L || null,
          },
          issuer: {
            CN: cert.issuer?.CN || "",
            O: cert.issuer?.O || "",
            C: cert.issuer?.C || null,
          },
          serial_number: cert.serialNumber || "",
          fingerprint: cert.fingerprint || "",
          fingerprint256: cert.fingerprint256 || "",
          valid_from: cert.valid_from,
          valid_to: cert.valid_to,
          days_remaining: daysRemaining,
          expired: isExpired,
          expiring_soon: isExpiringSoon,
          san: cert.subjectaltname
            ? cert.subjectaltname
                .split(",")
                .map((s: string) => s.trim())
                .filter(Boolean)
            : [],
          key_bits: cert.bits || 0,
          public_key: cert.pubkey
            ? {
                type: cert.pubkey.asymmetricKeyType || "unknown",
                bits: cert.pubkey.asymmetricKeyDetails?.modulusLength || null,
              }
            : null,
        });
      }
    );

    socket.setTimeout(10000);
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("انتهت مهلة الاتصال بالـ domain"));
    });
    socket.on("error", (err: any) => {
      socket.destroy();
      reject(new Error(`فشل الاتصال: ${err.message}`));
    });
  });
}
