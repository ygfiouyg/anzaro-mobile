/**
 * MCP Tool: Text Reverser
 * بيعكس النص بطرق مختلفة (محلي).
 */
import type { MCPTool } from "../types";

export const textReverserTool: MCPTool = {
  name: "text_reverser",
  description: "عكس النص بطرق مختلفة (محلي). استخدمها لما المستخدم يقول 'عكس نص' أو 'reverse text' أو 'اطبع بالمقلوب'.",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "النص للعكس" },
      mode: {
        type: "string",
        description: "النوع: characters, words, lines, words_chars, upside_down (افتراضي: characters)",
        default: "characters",
      },
    },
    required: ["text"],
  },
  async execute(params) {
    const text = String(params.text || "");
    const mode = String(params.mode || "characters").toLowerCase();

    if (!text) return { success: false, error: "text مطلوب" };
    if (text.length > 50000) return { success: false, error: "النص طويل جداً" };

    try {
      let result: string;

      switch (mode) {
        case "characters":
        case "chars":
          result = Array.from(text).reverse().join("");
          break;

        case "words":
          result = text.split(/\s+/).reverse().join(" ");
          break;

        case "lines":
          result = text.split("\n").reverse().join("\n");
          break;

        case "words_chars":
        case "word_chars":
          result = text
            .split(/\s+/)
            .map((word) => Array.from(word).reverse().join(""))
            .join(" ");
          break;

        case "upside_down":
        case "flipped":
          result = flipText(text);
          break;

        default:
          return { success: false, error: `نوع غير معروف: ${mode}` };
      }

      return {
        success: true,
        data: {
          mode,
          original: text.slice(0, 500),
          reversed: result.slice(0, 20000),
          original_length: text.length,
          result_length: result.length,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};

const FLIP_MAP: Record<string, string> = {
  a: "ɐ", b: "q", c: "ɔ", d: "p", e: "ǝ", f: "ɟ", g: "ƃ", h: "ɥ",
  i: "ᴉ", j: "ɾ", k: "ʞ", l: "l", m: "ɯ", n: "u", o: "o", p: "d",
  q: "b", r: "ɹ", s: "s", t: "ʇ", u: "n", v: "ʌ", w: "ʍ", x: "x",
  y: "ʎ", z: "z",
  A: "∀", B: "B", C: "Ɔ", D: "D", E: "Ǝ", F: "Ⅎ", G: "G", H: "H",
  I: "I", J: "ſ", K: "K", L: "˥", M: "W", N: "N", O: "O", P: "Ԁ",
  Q: "Q", R: "R", S: "S", T: "┴", U: "∩", V: "Λ", W: "M", X: "X",
  Y: "⅄", Z: "Z",
  "0": "0", "1": "1", "2": "ᄅ", "3": "Ɛ", "4": "ㄣ", "5": "ϛ",
  "6": "9", "7": "ㄥ", "8": "8", "9": "6",
  ".": "˙", ",": "'", "'": ",", "\"": ",,", "!": "¡", "?": "¿",
  "(": ")", ")": "(", "[": "]", "]": "[", "{": "}", "}": "{",
  "<": ">", ">": "<", "&": "⅋", "_": "‾",
  " ": " ",
};

function flipText(text: string): string {
  return Array.from(text)
    .map((ch) => FLIP_MAP[ch] || ch)
    .reverse()
    .join("");
}
