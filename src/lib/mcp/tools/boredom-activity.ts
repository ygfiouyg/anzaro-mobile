/**
 * MCP Tool: Bored Activity
 * تكامل حقيقي مع Bored API (مجاني، بدون API key).
 * بيقترح نشاط لما تكون ملان.
 */
import type { MCPTool } from "../types";

export const boredomActivityTool: MCPTool = {
  name: "bored_activity",
  description: "اقتراح نشاط لما تكون ملان (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'bored' أو 'ملان' أو 'اعمل ايه'.",
  parameters: {
    type: "object",
    properties: {
      type: {
        type: "string",
        description: "education, recreational, social, diy, charity, cooking, relaxation, music, busywork (اختياري)",
      },
      participants: { type: "number", description: "عدد الأشخاص (اختياري)" },
      price: { type: "string", description: "الميزانية: free, low, medium, high (اختياري)" },
    },
    required: [],
  },
  async execute(params) {
    const type = String(params.type || "").toLowerCase().trim();
    const participants = Number(params.participants) || null;
    const priceStr = String(params.price || "").toLowerCase().trim();

    try {
      const params2 = new URLSearchParams();
      if (type) params2.set("type", type);
      if (participants) params2.set("participants", String(participants));

      // price ranges
      if (priceStr === "free") params2.set("price", "0");
      else if (priceStr === "low") params2.set("minprice", "0.1", ); params2.set("maxprice", "0.3");
      if (priceStr === "medium") { params2.set("minprice", "0.3"); params2.set("maxprice", "0.6"); }
      if (priceStr === "high") { params2.set("minprice", "0.6"); params2.set("maxprice", "1.0"); }

      const url = `https://www.boredapi.com/api/activity?${params2.toString()}`;
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "DeltaAI-MCP/1.0" },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) return { success: false, error: `Bored API error ${res.status}` };

      const data: any = await res.json();

      if (data.error) {
        return { success: false, error: data.error };
      }

      const priceLabels = ["مجاني", "رخيص جداً", "رخيص", "متوسط", "غالي قليلاً", "غالي", "غالي جداً"];
      const priceIdx = Math.min(6, Math.floor((data.price || 0) * 7));

      return {
        success: true,
        data: {
          activity: data.activity || "",
          type: data.type || "",
          participants: data.participants || 1,
          price: data.price || 0,
          price_label: priceLabels[priceIdx],
          link: data.link || "",
          key: data.key || "",
          accessibility: data.accessibility || 0,
          accessibility_label: (data.accessibility || 0) < 0.3 ? "سهل" : (data.accessibility || 0) < 0.6 ? "متوسط" : "صعب",
          source: "boredapi.com",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
