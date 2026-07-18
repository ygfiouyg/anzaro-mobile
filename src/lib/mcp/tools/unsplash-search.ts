/**
 * MCP Tool: Unsplash Source
 * تكامل حقيقي مع Unsplash Source API (مجاني، بدون API key).
 * بيرجّع صور عشوائية حسب الكلمة المفتاحية.
 */
import type { MCPTool } from "../types";

export const unsplashSearchTool: MCPTool = {
  name: "unsplash_search",
  description: "صور عشوائية حسب كلمة (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'صور' أو 'unsplash' أو 'صورة عشوائية'.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "كلمة البحث (مثلاً: nature, city, technology)" },
      count: { type: "number", description: "عدد الصور (افتراضي: 3، أقصى: 10)", default: 3 },
      size: { type: "string", description: "small, medium, large (افتراضي: medium)", default: "medium" },
    },
    required: ["query"],
  },
  async execute(params) {
    const query = String(params.query || "").trim();
    const count = Math.min(10, Math.max(1, Number(params.count) || 3));
    const size = String(params.size || "medium").toLowerCase();

    if (!query) return { success: false, error: "query مطلوبة" };

    const sizeMap: Record<string, string> = {
      small: "400x300",
      medium: "800x600",
      large: "1200x900",
    };
    const dimensions = sizeMap[size] || sizeMap.medium;

    try {
      // Unsplash Source بيرجّع redirect لصورة عشوائية
      const images: any[] = [];
      for (let i = 0; i < count; i++) {
        const url = `https://source.unsplash.com/${dimensions}/?${encodeURIComponent(query)}&sig=${i}`;
        images.push({
          url,
          thumb: `https://source.unsplash.com/200x150/?${encodeURIComponent(query)}&sig=${i}`,
          query,
          size,
          dimensions,
          index: i + 1,
        });
      }

      return {
        success: true,
        data: {
          query,
          count: images.length,
          size,
          images,
          source: "source.unsplash.com",
          note: "Unsplash Source بيرجّع صور عشوائية. كل صورة URL مختلف.",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
