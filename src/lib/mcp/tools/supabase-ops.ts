/**
 * MCP Tool: Supabase Operations
 * القسم 3 #2: "Supabase Insertion & Upsertion & Retrieval"
 * الخطوات: upsert/insert/retrieve من Supabase عبر REST API
 */
import type { MCPTool } from "../types";

export const supabaseOpsTool: MCPTool = {
  name: "supabase_ops",
  description: "عمليات Supabase — insert/upsert/retrieve (سيناريو متكامل). استخدمها لما المستخدم يقول 'supabase' أو 'insert data' أو 'retrieve'.",
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", description: "insert, upsert, retrieve, delete" },
      table: { type: "string", description: "اسم الجدول" },
      data: { type: "string", description: "البيانات بصيغة JSON (لـ insert/upsert)" },
      filters: { type: "string", description: "فلاتر بصيغة JSON (لـ retrieve/delete)" },
    },
    required: ["action", "table"],
  },
  async execute(params) {
    const action = String(params.action || "").toLowerCase();
    const table = String(params.table || "").trim();
    if (!action || !table) return { success: false, error: "action و table مطلوبين" };

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return { success: false, error: "SUPABASE_URL و SUPABASE_SECRET_KEY مطلوبين في env vars" };
    }

    try {
      const headers: Record<string, string> = {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      };

      let url = `${supabaseUrl}/rest/v1/${table}`;
      let method = "GET";
      let body: string | undefined;

      if (action === "insert" || action === "upsert") {
        const data = String(params.data || "").trim();
        if (!data) return { success: false, error: "data مطلوبة لـ insert/upsert" };
        method = "POST";
        body = data;
        if (action === "upsert") {
          headers["Prefer"] = "resolution=merge-duplicates";
        } else {
          headers["Prefer"] = "return=representation";
        }
      } else if (action === "retrieve") {
        const filters = String(params.filters || "").trim();
        if (filters) {
          try {
            const parsed = JSON.parse(filters);
            const filterStr = Object.entries(parsed).map(([k, v]) => `${k}=eq.${v}`).join("&");
            url += `?${filterStr}`;
          } catch {}
        }
      } else if (action === "delete") {
        const filters = String(params.filters || "").trim();
        if (!filters) return { success: false, error: "filters مطلوبة لـ delete" };
        method = "DELETE";
        try {
          const parsed = JSON.parse(filters);
          const filterStr = Object.entries(parsed).map(([k, v]) => `${k}=eq.${v}`).join("&");
          url += `?${filterStr}`;
        } catch {}
      } else {
        return { success: false, error: `action غير معروف: ${action}` };
      }

      const res = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(10000) });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        return { success: false, error: `Supabase API error ${res.status}: ${errText.slice(0, 200)}` };
      }

      const result = await res.json().catch(() => ({}));

      return {
        success: true,
        data: {
          scenario: "supabase_ops",
          action,
          table,
          method,
          status: res.status,
          rows_affected: Array.isArray(result) ? result.length : (result ? 1 : 0),
          data: result,
        },
      };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
