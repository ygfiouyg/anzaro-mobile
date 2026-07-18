/**
 * MCP Tool: Cat Breeds
 * تكامل حقيقي مع The Cat API (مجاني بدون key، بـ key = 10K/شهر).
 */
import type { MCPTool } from "../types";

export const catBreedsTool: MCPTool = {
  name: "cat_breeds",
  description: "كل سلالات القطط + معلومات (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'cat breeds' أو 'سلالات قطط'.",
  parameters: {
    type: "object",
    properties: {
      breed: { type: "string", description: "breed ID للتفاصيل (اختياري)" },
      count: { type: "number", description: "عدد النتائج (افتراضي: 0 = الكل)", default: 0 },
    },
    required: [],
  },
  async execute(params) {
    const breed = String(params.breed || "").trim().toLowerCase();
    const count = Number(params.count) || 0;

    try {
      const apiKey = process.env.CAT_API_KEY || "";
      const headers: Record<string, string> = {
        Accept: "application/json",
        "User-Agent": "DeltaAI-MCP/1.0",
        ...(apiKey ? { "x-api-key": apiKey } : {}),
      };

      if (breed) {
        // single breed details + image
        const [breedsRes, imgRes] = await Promise.all([
          fetch("https://api.thecatapi.com/v1/breeds", { headers, signal: AbortSignal.timeout(10000) }),
          fetch(`https://api.thecatapi.com/v1/images/search?breed_ids=${breed}&limit=1`, { headers, signal: AbortSignal.timeout(10000) }),
        ]);

        if (!breedsRes.ok) return { success: false, error: `Cat API error ${breedsRes.status}` };

        const breedsData: any[] = await breedsRes.json();
        const breedData = breedsData.find((b: any) => b.id === breed);

        if (!breedData) return { success: false, error: `Breed "${breed}" مش موجود` };

        const imgData: any[] = imgRes.ok ? await imgRes.json() : [];

        return {
          success: true,
          data: {
            mode: "detail",
            id: breedData.id,
            name: breedData.name,
            temperament: breedData.temperament || "",
            origin: breedData.origin || "",
            country_code: breedData.country_code || "",
            description: breedData.description || "",
            life_span: breedData.life_span || "",
            weight: {
              imperial: breedData.weight?.imperial || "",
              metric: breedData.weight?.metric || "",
            },
            hypoallergenic: breedData.hypoallergenic || false,
            adaptability: breedData.adaptability || 0,
            affection_level: breedData.affection_level || 0,
            child_friendly: breedData.child_friendly || 0,
            dog_friendly: breedData.dog_friendly || 0,
            energy_level: breedData.energy_level || 0,
            grooming: breedData.grooming || 0,
            health_issues: breedData.health_issues || 0,
            intelligence: breedData.intelligence || 0,
            shedding_level: breedData.shedding_level || 0,
            social_needs: breedData.social_needs || 0,
            stranger_friendly: breedData.stranger_friendly || 0,
            vocalisation: breedData.vocalisation || 0,
            experimental: breedData.experimental || false,
            hairless: breedData.hairless || false,
            natural: breedData.natural || false,
            rare: breedData.rare || false,
            rex: breedData.rex || false,
            suppressed_tail: breedData.suppressed_tail || false,
            short_legs: breedData.short_legs || false,
            wikipedia_url: breedData.wikipedia_url || "",
            image: imgData[0] ? {
              url: imgData[0].url,
              width: imgData[0].width,
              height: imgData[0].height,
            } : null,
            source: "thecatapi.com",
          },
        };
      }

      // all breeds
      const res = await fetch("https://api.thecatapi.com/v1/breeds", { headers, signal: AbortSignal.timeout(10000) });
      if (!res.ok) return { success: false, error: `Cat API error ${res.status}` };

      const data: any[] = await res.json();
      let breeds = data.map((b: any) => ({
        id: b.id,
        name: b.name,
        origin: b.origin || "",
        temperament: b.temperament || "",
        life_span: b.life_span || "",
        wikipedia_url: b.wikipedia_url || "",
      }));

      if (count > 0) breeds = breeds.slice(0, count);

      return {
        success: true,
        data: {
          mode: "list",
          total: data.length,
          shown: breeds.length,
          breeds,
          source: "thecatapi.com",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
