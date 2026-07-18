/**
 * MCP Tool: Ping Test
 * بيعمل HEAD request لأي URL ويرجّع latency + status.
 * مفيد لمراقبة uptime وسرعة الاستجابة.
 */
import type { MCPTool } from "../types";

export const pingTestTool: MCPTool = {
  name: "ping_test",
  description: "ping/latency لأي URL (fetch حقيقي). استخدمها لما المستخدم يقول 'ping' أو 'latency' أو 'سرعة الموقع'.",
  parameters: {
    type: "object",
    properties: {
      url: { type: "string", description: "الـ URL للفحص (مثلاً: https://google.com)" },
      count: { type: "number", description: "عدد المحاولات (افتراضي: 3، أقصى: 10)", default: 3 },
    },
    required: ["url"],
  },
  async execute(params) {
    let url = String(params.url || "").trim();
    const count = Math.min(10, Math.max(1, Number(params.count) || 3));
    if (!url) return { success: false, error: "url مطلوب" };

    if (!/^https?:\/\//i.test(url)) {
      url = `https://${url}`;
    }

    try {
      new URL(url);
    } catch {
      return { success: false, error: "صيغة URL غير صحيحة" };
    }

    try {
      const pings: any[] = [];
      let totalLatency = 0;
      let successCount = 0;
      let lastStatus = 0;
      let lastStatusText = "";

      for (let i = 0; i < count; i++) {
        const start = Date.now();
        try {
          const res = await fetch(url, {
            method: "HEAD",
            redirect: "follow",
            signal: AbortSignal.timeout(10000),
            headers: { "User-Agent": "DeltaAI-MCP-Ping/1.0" },
          });
          const latency = Date.now() - start;
          lastStatus = res.status;
          lastStatusText = res.statusText;
          pings.push({
            attempt: i + 1,
            latency_ms: latency,
            status: res.status,
            ok: res.ok,
          });
          totalLatency += latency;
          if (res.ok) successCount++;
        } catch (e: any) {
          const latency = Date.now() - start;
          pings.push({
            attempt: i + 1,
            latency_ms: latency,
            status: 0,
            ok: false,
            error: e.message,
          });
          totalLatency += latency;
        }

        // delay بين المحاولات (500ms)
        if (i < count - 1) {
          await new Promise((r) => setTimeout(r, 500));
        }
      }

      const avgLatency = Math.round(totalLatency / count);
      const minLatency = Math.min(...pings.map((p) => p.latency_ms));
      const maxLatency = Math.max(...pings.map((p) => p.latency_ms));
      const successRate = Math.round((successCount / count) * 100);

      let rating: string;
      if (avgLatency < 100) rating = "ممتازة";
      else if (avgLatency < 300) rating = "جيدة";
      else if (avgLatency < 1000) rating = "متوسطة";
      else if (avgLatency < 3000) rating = "بطيئة";
      else rating = "بطيئة جداً";

      return {
        success: true,
        data: {
          url,
          final_url: url,
          count,
          success_count: successCount,
          success_rate: successRate,
          avg_latency_ms: avgLatency,
          min_latency_ms: minLatency,
          max_latency_ms: maxLatency,
          last_status: lastStatus,
          last_status_text: lastStatusText,
          rating,
          pings,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
