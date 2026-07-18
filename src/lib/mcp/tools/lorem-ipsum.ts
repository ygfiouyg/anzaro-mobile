/**
 * MCP Tool: Lorem Ipsum Generator
 * بيولّد نص وهمي (lorem ipsum) للتصميم والاختبار.
 * محلي — بدون API خارجي.
 */
import type { MCPTool } from "../types";

const WORDS = [
  "lorem", "ipsum", "dolor", "sit", "amet", "consectetur", "adipiscing", "elit",
  "sed", "do", "eiusmod", "tempor", "incididunt", "ut", "labore", "et", "dolore",
  "magna", "aliqua", "enim", "ad", "minim", "veniam", "quis", "nostrud",
  "exercitation", "ullamco", "laboris", "nisi", "aliquip", "ex", "ea", "commodo",
  "consequat", "duis", "aute", "irure", "in", "reprehenderit", "voluptate",
  "velit", "esse", "cillum", "fugiat", "nulla", "pariatur", "excepteur", "sint",
  "occaecat", "cupidatat", "non", "proident", "sunt", "culpa", "qui", "officia",
  "deserunt", "mollit", "anim", "id", "est", "laborum", "vivamus", "vestibulum",
  "sapien", "auctor", "morbi", "praesent", "libero", "nullam", "pellentesque",
  "habitant", "morbi", "tristique", "senectus", "netus", "malesuada", "fames",
  "turpis", "egestas", "vestibulum", "tortor", "ultrices", "vulputate", "euismod",
];

const SENTENCES = [
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
  "Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
  "Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.",
  "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum.",
  "Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia.",
  "Nulla facilisi morbi tempus iaculis urna id volutpat lacus.",
  "Vestibulum lorem ipsum dolor sit amet consectetur adipiscing elit.",
  "Pellentesque habitant morbi tristique senectus et netus et malesuada.",
  "Cras tincidunt lobortis feugiat vivamus at augue eget arcu.",
  "Euismod quis viverra nibh cras pulvinar mattis nunc sed.",
];

export const loremIpsumTool: MCPTool = {
  name: "lorem_ipsum",
  description: "ولّد نص وهمي (lorem ipsum) للتصميم (محلي). استخدمها لما المستخدم يقول 'lorem' أو 'نص وهمي' أو 'placeholder text'.",
  parameters: {
    type: "object",
    properties: {
      type: {
        type: "string",
        description: "النوع: words, sentences, paragraphs, list (افتراضي: paragraphs)",
        default: "paragraphs",
      },
      count: { type: "number", description: "العدد (افتراضي: 3)", default: 3 },
      startWithLorem: { type: "boolean", description: "ابدأ بـ 'Lorem ipsum...' (افتراضي: true)", default: true },
    },
    required: [],
  },
  async execute(params) {
    const type = String(params.type || "paragraphs").toLowerCase();
    const count = Math.min(100, Math.max(1, Number(params.count) || 3));
    const startWithLorem = params.startWithLorem !== false;

    try {
      let result: string;

      switch (type) {
        case "words":
          result = generateWords(count, startWithLorem);
          break;
        case "sentences":
          result = generateSentences(count, startWithLorem);
          break;
        case "list":
          result = generateList(count, startWithLorem);
          break;
        case "paragraphs":
        default:
          result = generateParagraphs(count, startWithLorem);
          break;
      }

      return {
        success: true,
        data: {
          type,
          count,
          text: result,
          word_count: result.split(/\s+/).filter(Boolean).length,
          char_count: result.length,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};

function randomWord(): string {
  return WORDS[Math.floor(Math.random() * WORDS.length)];
}

function randomSentence(): string {
  return SENTENCES[Math.floor(Math.random() * SENTENCES.length)];
}

function generateWords(count: number, startWithLorem: boolean): string {
  const words: string[] = [];
  if (startWithLorem) {
    words.push("lorem", "ipsum");
  }
  for (let i = words.length; i < count; i++) {
    words.push(randomWord());
  }
  // capitalize first
  if (words.length > 0) {
    words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1);
  }
  return words.join(" ") + ".";
}

function generateSentences(count: number, startWithLorem: boolean): string {
  const sentences: string[] = [];
  for (let i = 0; i < count; i++) {
    if (i === 0 && startWithLorem) {
      sentences.push(SENTENCES[0]);
    } else {
      sentences.push(randomSentence());
    }
  }
  return sentences.join(" ");
}

function generateParagraphs(count: number, startWithLorem: boolean): string {
  const paragraphs: string[] = [];
  for (let i = 0; i < count; i++) {
    const sentenceCount = 3 + Math.floor(Math.random() * 4); // 3-6 sentences
    const sentences: string[] = [];
    for (let j = 0; j < sentenceCount; j++) {
      if (i === 0 && j === 0 && startWithLorem) {
        sentences.push(SENTENCES[0]);
      } else {
        sentences.push(randomSentence());
      }
    }
    paragraphs.push(sentences.join(" "));
  }
  return paragraphs.join("\n\n");
}

function generateList(count: number, startWithLorem: boolean): string {
  const items: string[] = [];
  for (let i = 0; i < count; i++) {
    const words: string[] = [];
    const wordCount = 2 + Math.floor(Math.random() * 4);
    for (let j = 0; j < wordCount; j++) {
      words.push(randomWord());
    }
    items.push(`- ${words.join(" ")}`);
  }
  return items.join("\n");
}
