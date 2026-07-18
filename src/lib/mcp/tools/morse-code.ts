/**
 * MCP Tool: Morse Code Translator
 * تحويل بين نص و Morse code (محلي).
 */
import type { MCPTool } from "../types";

const MORSE_MAP: Record<string, string> = {
  A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.", G: "--.",
  H: "....", I: "..", J: ".---", K: "-.-", L: ".-..", M: "--", N: "-.",
  O: "---", P: ".--.", Q: "--.-", R: ".-.", S: "...", T: "-", U: "..-",
  V: "...-", W: ".--", X: "-..-", Y: "-.--", Z: "--..",
  "0": "-----", "1": ".----", "2": "..---", "3": "...--", "4": "....-",
  "5": ".....", "6": "-....", "7": "--...", "8": "---..", "9": "----.",
  ".": ".-.-.-", ",": "--..--", "?": "..--..", "'": ".----.",
  "!": "-.-.--", "/": "-..-.", "(": "-.--.", ")": "-.--.-",
  "&": ".-...", ":": "---...", ";": "-.-.-.", "=": "-...-",
  "+": ".-.-.", "-": "-....-", "_": "..--.-", "\"": ".-..-.",
  "@": ".--.-.", " ": "/",
};

const REVERSE_MORSE: Record<string, string> = Object.fromEntries(
  Object.entries(MORSE_MAP).map(([k, v]) => [v, k])
);

export const morseCodeTool: MCPTool = {
  name: "morse_code",
  description: "تحويل بين نص و Morse code (محلي). استخدمها لما المستخدم يقول 'morse' أو 'شفرة مورس'.",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "النص أو الـ morse code" },
      direction: { type: "string", description: "encode (نص→morse) أو decode (morse→نص)", default: "encode" },
    },
    required: ["text"],
  },
  async execute(params) {
    const text = String(params.text || "");
    const direction = String(params.direction || "encode").toLowerCase();

    if (!text) return { success: false, error: "text مطلوب" };
    if (text.length > 10000) return { success: false, error: "النص طويل جداً" };

    try {
      let result: string;
      let unsupported: string[] = [];

      if (direction === "encode") {
        const upper = text.toUpperCase();
        const words: string[] = [];
        for (const word of upper.split(" ")) {
          const morseChars: string[] = [];
          for (const ch of word) {
            if (MORSE_MAP[ch]) {
              morseChars.push(MORSE_MAP[ch]);
            } else {
              unsupported.push(ch);
            }
          }
          words.push(morseChars.join(" "));
        }
        result = words.join(" / ");
      } else if (direction === "decode") {
        const words = text.split(/\s*\/\s*/);
        const decodedWords: string[] = [];
        for (const word of words) {
          const morseChars = word.trim().split(/\s+/);
          const decodedChars: string[] = [];
          for (const mc of morseChars) {
            if (REVERSE_MORSE[mc]) {
              decodedChars.push(REVERSE_MORSE[mc]);
            } else if (mc) {
              unsupported.push(mc);
            }
          }
          decodedWords.push(decodedChars.join(""));
        }
        result = decodedWords.join(" ");
      } else {
        return { success: false, error: `direction غير معروف: ${direction}. جرّب: encode أو decode` };
      }

      return {
        success: true,
        data: {
          original: text.slice(0, 500),
          direction,
          result: result.slice(0, 20000),
          unsupported_chars: [...new Set(unsupported)],
          original_length: text.length,
          result_length: result.length,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
