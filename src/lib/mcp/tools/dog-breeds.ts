/**
 * MCP Tool: Dog Breeds
 * تكامل حقيقي مع Dog API (مجاني، بدون API key).
 */
import type { MCPTool } from "../types";

export const dogBreedsTool: MCPTool = {
  name: "dog_breeds",
  description: "كل سلالات الكلاب + صور (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'dog breeds' أو 'سلالات كلاب'.",
  parameters: {
    type: "object",
    properties: {
      breed: { type: "string", description: "اسم السلالة (اختياري)" },
      count: { type: "number", description: "عدد الصور (افتراضي: 1، أقصى: 50)", default: 1 },
    },
    required: [],
  },
  async execute(params) {
    const breed = String(params.breed || "").trim().toLowerCase();
    const count = Math.min(50, Math.max(1, Number(params.count) || 1));

    try {
      if (breed) {
        // breed-specific images
        const res = await fetch(`https://dog.ceo/api/breed/${encodeURIComponent(breed)}/images/random/${count}`, {
          headers: { Accept: "application/json", "User-Agent": "DeltaAI-MCP/1.0" },
          signal: AbortSignal.timeout(10000),
        });

        if (res.status === 404) {
          // try as sub-breed
          return { success: false, error: `السلالة "${breed}" مش موجودة. جرّب: labrador, poodle, husky, german shepherd` };
        }
        if (!res.ok) return { success: false, error: `Dog API error ${res.status}` };

        const data: any = await res.json();

        return {
          success: true,
          data: {
            mode: "breed_images",
            breed,
            images: data.message || [],
            count: (data.message || []).length,
            source: "dog.ceo",
          },
        };
      }

      // all breeds list
      const res = await fetch("https://dog.ceo/api/breeds/list/all", {
        headers: { Accept: "application/json", "User-Agent": "DeltaAI-MCP/1.0" },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) return { success: false, error: `Dog API error ${res.status}` };

      const data: any = await res.json();
      const breedsMap = data.message || {};
      const breeds = Object.entries(breedsMap).map(([name, subBreeds]) => ({
        breed: name,
        sub_breeds: subBreeds as string[],
        has_sub_breeds: (subBreeds as string[]).length > 0,
      }));

      // also get a random image
      const randomRes = await fetch("https://dog.ceo/api/breeds/image/random", {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(5000),
      });
      const randomData: any = randomRes.ok ? await randomRes.json() : {};
      const randomImage = randomData.message || "";

      return {
        success: true,
        data: {
          mode: "list",
          total_breeds: breeds.length,
          breeds,
          random_image: randomImage,
          source: "dog.ceo",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
