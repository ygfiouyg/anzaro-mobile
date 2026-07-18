/**
 * MCP Tool: Word Definition
 * تكامل حقيقي مع Free Dictionary API (مجاني تماماً، بدون API key).
 * بيرجّع تعريف + نطق + أمثلة لأي كلمة.
 */
import type { MCPTool } from "../types";

export const wordDefinitionTool: MCPTool = {
  name: "word_definition",
  description: "تعريف ونطق أي كلمة إنجليزية (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'تعريف' أو 'definition' أو 'معنى كلمة'.",
  parameters: {
    type: "object",
    properties: {
      word: { type: "string", description: "الكلمة للبحث" },
      lang: { type: "string", description: "اللغة: en, fr, de, es, it... (افتراضي: en)", default: "en" },
    },
    required: ["word"],
  },
  async execute(params) {
    const word = String(params.word || "").trim().toLowerCase();
    const lang = String(params.lang || "en").toLowerCase();
    if (!word) return { success: false, error: "word مطلوب" };
    if (!/^[a-z]+$/i.test(word)) {
      return { success: false, error: "الكلمة لازم تكون حروف إنجليزية فقط" };
    }

    try {
      const url = `https://api.dictionaryapi.dev/api/v2/entries/${lang}/${encodeURIComponent(word)}`;
      const res = await fetch(url, {
        headers: { "User-Agent": "DeltaAI-MCP/1.0", Accept: "application/json" },
        signal: AbortSignal.timeout(10000),
      });

      if (res.status === 404) {
        return { success: false, error: `الكلمة "${word}" مش موجودة في القاموس` };
      }
      if (!res.ok) {
        return { success: false, error: `Dictionary API error ${res.status}` };
      }

      const data: any[] = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        return { success: false, error: "مفيش نتائج" };
      }

      const entry = data[0];
      const meanings: any[] = [];

      for (const m of entry.meanings || []) {
        const definitions: any[] = [];
        for (const d of (m.definitions || []).slice(0, 3)) {
          definitions.push({
            definition: d.definition || "",
            example: d.example || null,
            synonyms: (d.synonyms || []).slice(0, 5),
            antonyms: (d.antonyms || []).slice(0, 5),
          });
        }
        meanings.push({
          part_of_speech: m.partOfSpeech || "",
          definitions,
          synonyms: (m.synonyms || []).slice(0, 5),
          antonyms: (m.antonyms || []).slice(0, 5),
        });
      }

      const phonetics: any[] = (entry.phonetics || []).map((p: any) => ({
        text: p.text || "",
        audio: p.audio || null,
        audio_url: p.audio ? `https:${p.audio}` : null,
      }));

      return {
        success: true,
        data: {
          word: entry.word || word,
          phonetic: entry.phonetic || "",
          phonetics,
          origin: entry.origin || null,
          meanings,
          source: "dictionaryapi.dev",
          lang,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
