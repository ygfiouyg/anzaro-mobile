/**
 * ZAI Client — العميل الرسمي لـ ZAI (ZhipuAI) API
 * ================================================
 * بيقرا الـ API key من ZAI_API_KEY env var.
 * لو الـ env var مش موجود، بيحاول يقرا من .z-ai-config (بيئة Z.ai).
 *
 * بيدعم:
 *   - Chat completions (GLM-5.2, GLM-5.1, GLM-4.6, إلخ)
 *   - Vision (صور، PDF، فيديو)
 *   - Image generation (CogView)
 *   - Video generation (CogVideoX)
 *   - TTS + ASR
 *   - Web search + Page reader
 *   - Thinking modes
 */

import { promises as fs } from "fs";
import path from "path";
import os from "os";

let _zaiInstance: any = null;
let _zaiInitPromise: Promise<any> | null = null;

/**
 * قرا ZAI config من env var أو ملف .z-ai-config.
 */
async function loadZAIConfig(): Promise<{ baseUrl: string; apiKey: string; [key: string]: any }> {
  // 1. جرّب env var الأول (bigmodel.cn — GLM-4-Flash مجاني هنا)
  const envKey = process.env.ZAI_API_KEY || process.env.ZHIPU_API_KEY || process.env.ZHIPUAI_API_KEY;
  if (envKey) {
    return {
      baseUrl: "https://open.bigmodel.cn/api/paas/v4",
      apiKey: envKey,
    };
  }

  // 2. جرّب ملف .z-ai-config (بيئة Z.ai)
  const homeDir = os.homedir();
  const configPaths = [
    path.join(process.cwd(), ".z-ai-config"),
    path.join(homeDir, ".z-ai-config"),
    "/etc/.z-ai-config",
  ];

  for (const filePath of configPaths) {
    try {
      const configStr = await fs.readFile(filePath, "utf-8");
      const config = JSON.parse(configStr);
      if (config.baseUrl && config.apiKey) {
        return config;
      }
    } catch {
      // continue
    }
  }

  throw new Error("ZAI config not found. Set ZAI_API_KEY env var or create .z-ai-config file.");
}

/**
 * الحصول على ZAI client instance.
 */
export async function getZAIClient(): Promise<any> {
  if (_zaiInstance) return _zaiInstance;
  if (_zaiInitPromise) return _zaiInitPromise;

  _zaiInitPromise = (async () => {
    try {
      const config = await loadZAIConfig();
      // استخدم ZAI SDK مباشرة بـ config
      const ZAIModule = await import("z-ai-web-dev-sdk");
      const ZAI = ZAIModule.default;

      // لو فيه ZAI_API_KEY env var، استخدم الـ proxy مباشرة (مش ZAI.create())
      // عشان ZAI.create() بيستخدم internal-api.z.ai (محتاج session token)
      // واحنا عاوزين open.bigmodel.cn (بيشتغل بـ API key عادي)
      if (process.env.ZAI_API_KEY || process.env.ZHIPU_API_KEY || process.env.ZHIPUAI_API_KEY) {
        _zaiInstance = createZAIProxy(config);
        return _zaiInstance;
      }

      // لو مفيش env var، جرّب ZAI.create() (بيئة Z.ai)
      try {
        _zaiInstance = await ZAI.create();
        return _zaiInstance;
      } catch {
        // لو فشل، استخدم الـ config اللي قريناه
      }

      // إنشاء instance مباشرة بـ config
      _zaiInstance = createZAIProxy(config);
      return _zaiInstance;
    } catch (error: any) {
      _zaiInitPromise = null;
      throw new Error(`ZAI initialization failed: ${error.message}`);
    }
  })();

  try {
    return await _zaiInitPromise;
  } catch (error) {
    _zaiInitPromise = null;
    throw error;
  }
}

/**
 * إنشاء ZAI proxy بيستخدم fetch مباشرة (لما ZAI.create() يفشل).
 * ده بيشتغل بأي API key من env var.
 */
function createZAIProxy(config: { baseUrl: string; apiKey: string }) {
  const baseUrl = config.baseUrl.replace(/\/$/, "");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.apiKey}`,
  };

  return {
    chat: {
      completions: {
        create: async (request: any) => {
          const stream = request.stream || false;
          const res = await fetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers,
            body: JSON.stringify({ ...request, stream }),
          });

          if (!res.ok) {
            const errText = await res.text();
            throw new Error(`ZAI API error ${res.status}: ${errText.slice(0, 300)}`);
          }

          if (stream) {
            // رجّع async iterable (عشان streamFromZhipuAI يقدر يعمل for await)
            const reader = res.body!.getReader();
            const decoder = new TextDecoder();
            return {
              async *[Symbol.asyncIterator]() {
                let buffer = "";
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  buffer += decoder.decode(value, { stream: true });
                  const lines = buffer.split("\n");
                  buffer = lines.pop() ?? "";
                  for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || !trimmed.startsWith("data:")) continue;
                    const payload = trimmed.slice(5).trim();
                    if (payload === "[DONE]") return;
                    try {
                      yield JSON.parse(payload);
                    } catch {}
                  }
                }
              },
            };
          }

          return res.json();
        },
      },
    },
    images: {
      generations: {
        create: async (request: any) => {
          const res = await fetch(`${baseUrl}/images/generations`, {
            method: "POST",
            headers,
            body: JSON.stringify(request),
          });
          if (!res.ok) throw new Error(`ZAI image gen error ${res.status}`);
          return res.json();
        },
      },
    },
    audio: {
      tts: {
        create: async (request: any) => {
          const res = await fetch(`${baseUrl}/audio/speech`, {
            method: "POST",
            headers,
            body: JSON.stringify(request),
          });
          if (!res.ok) throw new Error(`ZAI TTS error ${res.status}`);
          return res;
        },
      },
      asr: {
        create: async (request: any) => {
          const res = await fetch(`${baseUrl}/audio/transcriptions`, {
            method: "POST",
            headers,
            body: JSON.stringify(request),
          });
          if (!res.ok) throw new Error(`ZAI ASR error ${res.status}`);
          return res.json();
        },
      },
    },
    functions: {
      invoke: async (functionName: string, args: any) => {
        const res = await fetch(`${baseUrl}/functions/invoke`, {
          method: "POST",
          headers,
          body: JSON.stringify({ function_name: functionName, arguments: args }),
        });
        if (!res.ok) throw new Error(`ZAI function error ${res.status}`);
        return res.json();
      },
    },
    video: {
      generations: {
        create: async (request: any) => {
          const res = await fetch(`${baseUrl}/videos/generations`, {
            method: "POST",
            headers,
            body: JSON.stringify(request),
          });
          if (!res.ok) throw new Error(`ZAI video error ${res.status}`);
          return res.json();
        },
      },
    },
    async: {
      result: {
        query: async (taskId: string) => {
          const res = await fetch(`${baseUrl}/async-result/${taskId}`, { headers });
          if (!res.ok) throw new Error(`ZAI async error ${res.status}`);
          return res.json();
        },
      },
    },
  };
}

/**
 * التحقق من إن ZAI شغال.
 */
export async function isZAIAvailable(): Promise<boolean> {
  try {
    const client = await getZAIClient();
    if (!client) return false;
    const res = await client.chat.completions.create({
      model: "glm-5.2",
      messages: [{ role: "user", content: "Hi" }],
      max_tokens: 5,
    });
    return !!res?.choices?.[0]?.message?.content;
  } catch {
    return false;
  }
}

/**
 * Chat completion مع GLM-5.2 (مع thinking mode).
 */
export async function chatWithGLM(
  messages: Array<{ role: string; content: string }>,
  options: {
    model?: string;
    thinking?: boolean;
    stream?: boolean;
    temperature?: number;
    max_tokens?: number;
  } = {}
): Promise<any> {
  const client = await getZAIClient();
  const {
    model = "glm-5.2",
    thinking = false,
    stream = false,
    temperature = 0.7,
    max_tokens = 4096,
  } = options;

  const request: any = {
    model,
    messages,
    stream,
    temperature,
    max_tokens,
  };

  if (thinking) {
    request.thinking = { type: "enabled" };
  }

  return client.chat.completions.create(request);
}

/**
 * Vision — تحليل صورة/PDF/فيديو.
 */
export async function analyzeImage(
  imageBase64: string,
  question: string,
  options: { model?: string } = {}
): Promise<string> {
  const client = await getZAIClient();
  const { model = "glm-4v" } = options;

  const response = await client.chat.completions.create({
    model,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: question },
          { type: "image_url", image_url: { url: imageBase64 } },
        ],
      },
    ],
  });

  return response?.choices?.[0]?.message?.content || "";
}

/**
 * توليد صورة بـ CogView.
 */
export async function generateImage(
  prompt: string,
  options: { size?: string } = {}
): Promise<string> {
  const client = await getZAIClient();
  const { size = "1024x1024" } = options;

  const response = await client.images.generations.create({
    prompt,
    size: size as any,
  });

  const base64 = response?.data?.[0]?.base64 || "";
  return base64 ? `data:image/png;base64,${base64}` : "";
}

/**
 * تحويل نص لصوت (TTS).
 */
export async function textToSpeech(
  text: string,
  options: { voice?: string; speed?: number } = {}
): Promise<Buffer> {
  const client = await getZAIClient();
  const { voice = "tongtong", speed = 1 } = options;

  const response = await client.audio.tts.create({
    input: text,
    voice,
    speed,
  });

  if (Buffer.isBuffer(response)) return response;
  if (response?.arrayBuffer) return Buffer.from(await response.arrayBuffer());
  return Buffer.from(response);
}

/**
 * تحويل صوت لنص (ASR).
 */
export async function speechToText(audioBase64: string): Promise<string> {
  const client = await getZAIClient();
  const response = await client.audio.asr.create({ file_base64: audioBase64 });
  return response?.text || "";
}

/**
 * Web Search — بحث في النت.
 */
export async function webSearch(
  query: string,
  options: { num?: number } = {}
): Promise<any[]> {
  const client = await getZAIClient();
  const { num = 5 } = options;

  try {
    const results = await client.functions.invoke("web_search", { query, num });
    return Array.isArray(results) ? results : [];
  } catch {
    return [];
  }
}

/**
 * Page Reader — قراءة محتوى URL.
 */
export async function readPage(url: string): Promise<any> {
  const client = await getZAIClient();
  return client.functions.invoke("page_reader", { url });
}
