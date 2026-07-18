/**
 * MCP Tool: URL Parser
 * بيحلّل أي URL تفصيلياً ويرجّع كل المكونات.
 * محلي — بدون API خارجي.
 */
import type { MCPTool } from "../types";

export const urlParserTool: MCPTool = {
  name: "url_parser",
  description: "حلّل أي URL تفصيلياً (محلي). استخدمها لما المستخدم يقول 'url' أو 'رابط' أو 'parse url'.",
  parameters: {
    type: "object",
    properties: {
      url: { type: "string", description: "الـ URL للتحليل" },
    },
    required: ["url"],
  },
  async execute(params) {
    const urlString = String(params.url || "").trim();
    if (!urlString) return { success: false, error: "url مطلوب" };
    if (urlString.length > 2000) return { success: false, error: "URL طويل جداً" };

    try {
      let url: URL;
      try {
        url = new URL(urlString);
      } catch {
        // جرّب إضافة https://
        try {
          url = new URL(`https://${urlString}`);
        } catch {
          return { success: false, error: "صيغة URL غير صحيحة" };
        }
      }

      // تحليل query params
      const searchParams: any[] = [];
      url.searchParams.forEach((value, key) => {
        searchParams.push({ key, value });
      });

      // استخراج معلومات إضافية
      const isSecure = url.protocol === "https:";
      const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname.startsWith("192.168.") || url.hostname.startsWith("10.");
      const hasCredentials = !!(url.username || url.password);

      // تحليل subdomain
      const hostnameParts = url.hostname.split(".");
      const tld = hostnameParts.length > 1 ? hostnameParts[hostnameParts.length - 1] : "";
      const sld = hostnameParts.length > 1 ? hostnameParts[hostnameParts.length - 2] : "";
      const subdomain = hostnameParts.length > 2 ? hostnameParts.slice(0, -2).join(".") : "";

      // UTM parameters
      const utmParams: any = {};
      ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach((utm) => {
        const val = url.searchParams.get(utm);
        if (val) utmParams[utm] = val;
      });

      // check if IP
      const isIPv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(url.hostname);
      const isIPv6 = url.hostname.startsWith("[") && url.hostname.endsWith("]");

      return {
        success: true,
        data: {
          original_url: urlString,
          href: url.href,
          protocol: url.protocol,
          slashes: url.protocol.endsWith(":"),
          auth: hasCredentials
            ? {
                username: decodeURIComponent(url.username),
                password: decodeURIComponent(url.password),
              }
            : null,
          host: url.host,
          hostname: url.hostname,
          port: url.port || null,
          is_default_port: !url.port,
          pathname: url.pathname,
          search: url.search || null,
          hash: url.hash || null,
          search_params: searchParams,
          search_params_count: searchParams.length,
          utm: Object.keys(utmParams).length > 0 ? utmParams : null,
          is_secure: isSecure,
          is_local: isLocal,
          is_ip: isIPv4 || isIPv6,
          ip_type: isIPv4 ? "IPv4" : isIPv6 ? "IPv6" : null,
          domain: {
            tld,
            sld,
            subdomain: subdomain || null,
            registered_domain: sld && tld ? `${sld}.${tld}` : url.hostname,
          },
          file_extension: url.pathname.match(/\.([a-z0-9]+)$/i)?.[1] || null,
          is_file_url: /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar|tar|gz|jpg|jpeg|png|gif|svg|mp4|mp3|avi|mov)$/i.test(url.pathname),
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
