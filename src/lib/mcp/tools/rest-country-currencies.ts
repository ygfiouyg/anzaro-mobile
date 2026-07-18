/**
 * MCP Tool: REST Country Currencies
 * تكامل حقيقي مع REST Countries API — عملات أي دولة.
 */
import type { MCPTool } from "../types";

export const restCountryCurrenciesTool: MCPTool = {
  name: "rest_country_currencies",
  description: "عملات أي دولة (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'عملات دولة' أو 'currencies'.",
  parameters: {
    type: "object",
    properties: {
      currency: { type: "string", description: "كود العملة (مثلاً: EGP, USD, EUR)" },
    },
    required: ["currency"],
  },
  async execute(params) {
    const currency = String(params.currency || "").toUpperCase().trim();
    if (!currency) return { success: false, error: "currency مطلوب" };
    try {
      const res = await fetch(`https://restcountries.com/v3.1/currency/${currency}?fields=name,cca2,cca3,flag,currencies,maps`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000) });
      if (res.status === 404) return { success: false, error: `العملة "${currency}" مش موجودة` };
      if (!res.ok) return { success: false, error: `API error ${res.status}` };
      const data: any[] = await res.json();
      const countries = data.map((c: any) => ({ name: c.name?.common || "", code: c.cca2 || "", flag: c.flag || "", currencies: Object.entries(c.currencies || {}).map(([code, info]: any) => ({ code, name: info.name || "", symbol: info.symbol || "" })) }));
      const currencyInfo = data[0]?.currencies?.[currency] || { code: currency, name: "", symbol: "" };
      return { success: true, data: { currency_code: currency, currency_name: currencyInfo.name || "", currency_symbol: currencyInfo.symbol || "", countries_using: countries.length, countries, source: "restcountries.com" } };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
