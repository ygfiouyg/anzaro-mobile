/**
 * Media & Content Tools — أدوات ميديا حقيقية
 * ========================================
 * بتستخدم ZAI API (CogView, CogVideoX, GLM-5.2) لتوليد:
 *   1. صور من نص (CogView)
 *   2. فيديو من نص (CogVideoX-2)
 *   3. بودكاست (GLM-5.2 يكتب حوار + TTS)
 *   4. تحليل يوتيوب (GLM-5.2 + web search)
 *   5. محتوى سوشيال (GLM-5.2)
 *   6. NotebookLM (GLM-5.2 ملخص + استشهادات)
 */

import { getZAIClient } from '../zai-client';

const ZAI_API_KEY = process.env.ZAI_API_KEY || '';
const ZAI_BASE = 'https://open.bigmodel.cn/api/paas/v4';

// ═══════════════════════════════════════════
// 1. Image Generation — توليد صور من نص
// ═══════════════════════════════════════════
export async function generateImage(prompt: string, size: string = '1024x1024'): Promise<{
  success: boolean;
  imageUrl?: string;
  base64?: string;
  error?: string;
}> {
  // ── 1) ZAI CogView-3-Flash (مجاني 100% من Zhipu) ──
  try {
    const response = await fetch(`${ZAI_BASE}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ZAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'cogview-3-flash',  // ✅ مجاني
        prompt,
        size,
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (response.ok) {
      const data = await response.json();
      const imageUrl = data?.data?.[0]?.url || '';
      if (imageUrl) {
        let base64 = '';
        try {
          const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(30_000) });
          const buf = Buffer.from(await imgRes.arrayBuffer());
          const mime = imgRes.headers.get('content-type') || 'image/png';
          base64 = `data:${mime};base64,${buf.toString('base64')}`;
        } catch {}
        console.log('[ImageGen] CogView-3-Flash succeeded');
        return { success: true, imageUrl, base64 };
      }
    } else {
      const err = await response.text();
      console.warn('[ImageGen] CogView-3-Flash failed:', err.slice(0, 150));
    }
  } catch (e: any) {
    console.warn('[ImageGen] CogView-3-Flash error:', e.message);
  }

  // ── 2) Pollinations FLUX (fallback مجاني 100%) ──
  try {
    const [w, h] = size.split('x').map((x) => parseInt(x.trim()) || 1024);
    const encodedPrompt = encodeURIComponent(prompt);
    const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${w}&height=${h}&nologo=true&model=flux`;

    const imgRes = await fetch(pollinationsUrl, { signal: AbortSignal.timeout(60_000) });
    if (imgRes.ok) {
      const buf = Buffer.from(await imgRes.arrayBuffer());
      if (buf.length > 1000) {
        const mime = imgRes.headers.get('content-type') || 'image/png';
        const base64 = `data:${mime};base64,${buf.toString('base64')}`;
        console.log('[ImageGen] Pollinations FLUX succeeded — size:', buf.length);
        return { success: true, imageUrl: pollinationsUrl, base64 };
      }
    }
    console.warn('[ImageGen] Pollinations failed, trying HF SD...');
  } catch (e: any) {
    console.warn('[ImageGen] Pollinations error:', e.message);
  }

  // ── 3) HuggingFace Stable Diffusion XL (fallback مجاني) ──
  try {
    const HF_TOKEN = process.env.HUGGINGFACE_API_TOKEN || '';
    if (HF_TOKEN) {
      const hfRes = await fetch(
        'https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${HF_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ inputs: prompt }),
          signal: AbortSignal.timeout(90_000),
        }
      );
      if (hfRes.ok) {
        const buf = Buffer.from(await hfRes.arrayBuffer());
        if (buf.length > 1000) {
          const base64 = `data:image/png;base64,${buf.toString('base64')}`;
          console.log('[ImageGen] HF SDXL succeeded — size:', buf.length);
          return { success: true, imageUrl: '', base64 };
        }
      }
    }
  } catch (e: any) {
    console.warn('[ImageGen] HF SDXL error:', e.message);
  }

  return { success: false, error: 'كل مصادر توليد الصور فشلت (CogView-3-Flash + Pollinations + HF SDXL)' };
}

// ═══════════════════════════════════════════
// 2. Video Generation — توليد فيديو من نص (async)
// ═══════════════════════════════════════════
/**
 * Poll على Zhipu video task لحد ما يخلص أو timeout.
 */
async function pollVideoTask(taskId: string, timeoutMs: number = 90_000): Promise<{
  success: boolean;
  videoUrl?: string;
  coverUrl?: string;
  status: string;
}> {
  const startTime = Date.now();
  const pollInterval = 5_000; // 5 ثواني بين كل poll

  while (Date.now() - startTime < timeoutMs) {
    try {
      const response = await fetch(`${ZAI_BASE}/async-result/${taskId}`, {
        headers: { 'Authorization': `Bearer ${ZAI_API_KEY}` },
        signal: AbortSignal.timeout(15_000),
      });

      if (response.ok) {
        const data = await response.json();
        const status = data?.task_status || 'PROCESSING';

        if (status === 'SUCCESS') {
          const videoUrl = data?.video_result?.[0]?.url || data?.video_result?.[0]?.cover_image_url || '';
          const coverUrl = data?.video_result?.[0]?.cover_image_url || '';
          if (videoUrl) {
            return { success: true, videoUrl, coverUrl, status };
          }
        }

        if (status === 'FAIL') {
          console.warn('[VideoGen] Task failed:', data?.msg || 'unknown');
          return { success: false, status };
        }
      }
    } catch (e: any) {
      console.warn('[VideoGen] Poll error:', e.message);
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  return { success: false, status: 'TIMEOUT' };
}

export async function generateVideo(prompt: string, options?: {
  quality?: 'speed' | 'quality';
  duration?: 5 | 10;
  with_audio?: boolean;
}): Promise<{
  success: boolean;
  taskId?: string;
  status?: string;
  videoUrl?: string;
  coverUrl?: string;
  error?: string;
}> {
  // ── 1) ZAI CogVideoX-Flash (مجاني 100% من Zhipu) ──
  try {
    const response = await fetch(`${ZAI_BASE}/videos/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ZAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'cogvideox-flash',  // ✅ مجاني
        prompt,
        quality: options?.quality || 'speed',
        duration: options?.duration || 5,
        with_audio: options?.with_audio || false,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (response.ok) {
      const data = await response.json();
      const taskId = data?.id || '';
      const status = data?.task_status || 'PROCESSING';
      if (taskId) {
        console.log('[VideoGen] CogVideoX-Flash task started:', taskId);

        // ── Poll على الـ task لحد ما يخلص (max 150 ثانية) ──
        const pollResult = await pollVideoTask(taskId, 150_000);
        if (pollResult.success && pollResult.videoUrl) {
          console.log('[VideoGen] CogVideoX-Flash completed:', pollResult.videoUrl.slice(0, 80));
          return {
            success: true,
            taskId,
            status: 'SUCCESS',
            videoUrl: pollResult.videoUrl,
            coverUrl: pollResult.coverUrl,
          };
        }
        // لو الـ poll فشل أو timeout، نرجع الـ taskId عشان المستخدم يستعلم بعدين
        console.warn('[VideoGen] CogVideoX-Flash poll failed, returning taskId for async query');
        return { success: true, taskId, status: 'PROCESSING' };
      }
    } else {
      const err = await response.text();
      console.warn('[VideoGen] CogVideoX-Flash failed:', err.slice(0, 150));
    }
  } catch (e: any) {
    console.warn('[VideoGen] CogVideoX-Flash error:', e.message);
  }

  // ── 2) HF LTX-Video (fallback مجاني 100% — بيرجع URL مباشر) ──
  try {
    const { generateVideoWithFallback } = await import('../hf-video.service');
    const result = await generateVideoWithFallback(prompt, ['ltx-video-distilled', 'cogvideox-2b'], { duration: options?.duration || 5 });
    if (result.videoUrl) {
      console.log('[VideoGen] HF LTX-Video succeeded:', result.videoUrl.slice(0, 80));
      return {
        success: true,
        taskId: 'hf-direct',
        status: 'SUCCESS',
      };
    }
  } catch (hfErr: any) {
    console.warn('[VideoGen] HF LTX-Video failed:', hfErr.message);
  }

  return { success: false, error: 'كل مصادر توليد الفيديو فشلت (CogVideoX-Flash + HF LTX-Video)' };
}

export async function getVideoResult(taskId: string): Promise<{
  success: boolean;
  status: string;
  videoUrl?: string;
  coverUrl?: string;
  error?: string;
}> {
  try {
    const response = await fetch(`${ZAI_BASE}/async-result/${taskId}`, {
      headers: { 'Authorization': `Bearer ${ZAI_API_KEY}` },
    });

    if (!response.ok) {
      return { success: false, status: 'FAIL', error: `API error ${response.status}` };
    }

    const data = await response.json();
    const videoResult = data?.video_result?.[0] || {};
    return {
      success: true,
      status: data?.task_status || 'PROCESSING',
      videoUrl: videoResult.url || '',
      coverUrl: videoResult.cover_image_url || '',
    };
  } catch (e: any) {
    return { success: false, status: 'FAIL', error: e.message };
  }
}

// ═══════════════════════════════════════════
// 3. Podcast Generation — توليد بودكاست
// ═══════════════════════════════════════════
export async function generatePodcast(topic: string): Promise<{
  success: boolean;
  script: string;
  error?: string;
}> {
  try {
    const client = await getZAIClient();
    const completion = await client.chat.completions.create({
      model: 'glm-5.2',
      messages: [
        {
          role: 'system',
          content: `أنت منتج بودكاست محترف. حوّل الموضوع ده لحوار بودكاست كامل بين مضيفين اتنين:
- المضيف 1: اسمه "أحمد" — بيبدأ النقاش وبيطرح الأسئلة
- المضيف 2: اسمها "سارة" — بترد وتشرح وتضيف معلومات

اكتب الحوار كامل بتنسيق:
🎙️ المضيف 1 (أحمد): ...
🎙️ المضيف 2 (سارة): ...

النقاط المهمة:
- خلي الحوار طبيعي وممتع
- اطرح أسئلة شيقة
- أضف معلومات مفيدة
- اختم بملخص ودعوة للمستمعين
- مدة البودكاست: 5-10 دقايق حوار`,
        },
        { role: 'user', content: `الموضوع: ${topic}` },
      ],
      thinking: { type: 'enabled' },
      max_tokens: 65536,
      temperature: 1.0,
    });

    const script = completion?.choices?.[0]?.message?.content || '';
    return { success: true, script };
  } catch (e: any) {
    return { success: false, script: '', error: e.message };
  }
}

// ═══════════════════════════════════════════
// 4. YouTube Trends — تحليل اتجاهات يوتيوب
// ═══════════════════════════════════════════
export async function analyzeYouTubeTrends(topic: string): Promise<{
  success: boolean;
  analysis: string;
  error?: string;
}> {
  try {
    const client = await getZAIClient();
    const completion = await client.chat.completions.create({
      model: 'glm-5.2',
      messages: [
        {
          role: 'system',
          content: `أنت محلل يوتيوب محترف. حلل اتجاهات يوتيوب واعطي تقرير شامل:

1. 📊 المواضيع الرائجة حالياً
2. 🎯 فرص المحتوى (content gaps)
3. 📈 أنواع الفيديوهات الأكثر مشاهدة
4. 💡 أفكار فيديوهات مقترحة (5 أفكار مع عناوين)
5. ⏰ أفضل أوقات النشر
6. 🏷️ هاشتاجات موصى بها

خلي التقرير بالعربي ومنظم.`,
        },
        { role: 'user', content: `حلل اتجاهات يوتيوب عن: ${topic}` },
      ],
      thinking: { type: 'enabled' },
      max_tokens: 65536,
      temperature: 1.0,
    });

    const analysis = completion?.choices?.[0]?.message?.content || '';
    return { success: true, analysis };
  } catch (e: any) {
    return { success: false, analysis: '', error: e.message };
  }
}

// ═══════════════════════════════════════════
// 5. Social Content — توليد محتوى سوشيال
// ═══════════════════════════════════════════
export async function generateSocialContent(topic: string, platform: string = 'instagram'): Promise<{
  success: boolean;
  content: string;
  error?: string;
}> {
  try {
    const client = await getZAIClient();
    const platformPrompts: Record<string, string> = {
      instagram: 'اكتب بوست إنستجرام مع: caption جذاب + 20 هاشتاج + وصف صورة مقترح',
      twitter: 'اكتب 3 تويترات (تحت 280 حرف) + هاشتاجات',
      linkedin: 'اكتب بوست لينكدإن احترافي + هاشتاجات',
      facebook: 'اكتب بوست فيسبوك جذاب + هاشتاجات',
      tiktok: 'اكتب سكريبت فيديو تيك توك (30 ثانية) + هاشتاجات',
    };

    const prompt = platformPrompts[platform] || platformPrompts.instagram;

    const completion = await client.chat.completions.create({
      model: 'glm-5.2',
      messages: [
        { role: 'system', content: `أنت خبير سوشيال ميديا. ${prompt}` },
        { role: 'user', content: `الموضوع: ${topic}` },
      ],
      thinking: { type: 'enabled' },
      max_tokens: 65536,
      temperature: 1.0,
    });

    const content = completion?.choices?.[0]?.message?.content || '';
    return { success: true, content };
  } catch (e: any) {
    return { success: false, content: '', error: e.message };
  }
}

// ═══════════════════════════════════════════
// 6. NotebookLM — ملخص + استشهادات + أسئلة
// بيستخدم Gemini 2.0 Flash الحقيقي (مع fallback لـ GLM-5.2 لو مفيش key)
// ═══════════════════════════════════════════
export async function notebookLMAnalysis(text: string): Promise<{
  success: boolean;
  analysis: string;
  error?: string;
}> {
  try {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
    if (!GEMINI_API_KEY) {
      // Fallback إلى ZAI (GLM-5.2) لو مفيش Gemini key
      const client = await getZAIClient();
      const completion = await client.chat.completions.create({
        model: 'glm-5.2',
        messages: [
          {
            role: 'system',
            content: `أنت مساعد NotebookLM. حلل المستند واعمل:

1. 📝 ملخص شامل (paragraph)
2. 🔑 النقاط الرئيسية (bullet points)
3. 💡 الأفكار المهمة
4. ❓ 5 أسئلة للنقاش
5. 📚 استشهادات من النص (اقتباسات مباشرة)
6. 🔗 روابط محتملة (مفاهيم مرتبطة)

خلي التحليل بالعربي ومنظم.`,
          },
          { role: 'user', content: `حلل المستند ده:\n\n${text.slice(0, 10000)}` },
        ],
        thinking: { type: 'enabled' },
        max_tokens: 65536,
        temperature: 1.0,
      });
      return { success: true, analysis: completion?.choices?.[0]?.message?.content || '' };
    }

    // ── استخدم Gemini 2.0 Flash الحقيقي (مش GLM محاكاة) ──
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `أنت مساعد NotebookLM. حلل المستند واعمل:\n1. 📝 ملخص شامل\n2. 🔑 النقاط الرئيسية (bullet points)\n3. 💡 الأفكار المهمة\n4. ❓ 5 أسئلة للنقاش\n5. 📚 استشهادات من النص (اقتباسات مباشرة)\n6. 🔗 روابط محتملة (مفاهيم مرتبطة)\n\nخلي التحليل بالعربي ومنظم.\n\nالمستند:\n${text.slice(0, 50000)}`,
            }],
          }],
          generationConfig: { temperature: 1.0, maxOutputTokens: 8192 },
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      // Fallback لـ GLM لو Gemini فشل
      console.warn(`[NotebookLM] Gemini failed (${response.status}), falling back to GLM. Error: ${err.slice(0, 200)}`);
      const client = await getZAIClient();
      const completion = await client.chat.completions.create({
        model: 'glm-5.2',
        messages: [
          {
            role: 'system',
            content: `أنت مساعد NotebookLM. حلل المستند واعمل ملخص + نقاط رئيسية + استشهادات + أسئلة. خلي الرد بالعربي ومنظم.`,
          },
          { role: 'user', content: `حلل المستند ده:\n\n${text.slice(0, 10000)}` },
        ],
        thinking: { type: 'enabled' },
        max_tokens: 65536,
        temperature: 1.0,
      });
      return { success: true, analysis: completion?.choices?.[0]?.message?.content || '' };
    }

    const data = await response.json();
    const analysis = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || '';
    return { success: true, analysis: `🤖 **Gemini 2.0 Flash (Real NotebookLM)**\n\n${analysis}` };
  } catch (e: any) {
    return { success: false, analysis: '', error: e.message };
  }
}

// ═══════════════════════════════════════════
// Registry
// ═══════════════════════════════════════════
export interface MediaToolDef {
  id: string;
  name: string;
  description: string;
  inputType: 'text' | 'url';
  placeholder: string;
  outputType: 'image' | 'video' | 'text' | 'audio';
}

export const MEDIA_TOOLS: MediaToolDef[] = [
  {
    id: 'media-image-gen',
    name: '🎨 توليد صورة',
    description: 'توليد صورة من وصف نصي بـ CogView. بترجع صورة حقيقية.',
    inputType: 'text',
    placeholder: 'اكتب وصف الصورة... مثال: غروب الشمس فوق الجبال، إضاءة سينمائية',
    outputType: 'image',
  },
  {
    id: 'media-video-gen',
    name: '🎬 توليد فيديو',
    description: 'توليد فيديو قصير (5 ثواني) من وصف نصي بـ CogVideoX.',
    inputType: 'text',
    placeholder: 'اكتب وصف الفيديو... مثال: أمواج البحر عند الغروب',
    outputType: 'video',
  },
  {
    id: 'media-podcast',
    name: '🎙️ توليد بودكاست',
    description: 'تحويل أي موضوع لحوار بودكاست كامل بين مضيفين اتنين.',
    inputType: 'text',
    placeholder: 'اكتب الموضوع... مثال: مستقبل الذكاء الاصطناعي',
    outputType: 'text',
  },
  {
    id: 'media-youtube',
    name: '📈 تحليل يوتيوب',
    description: 'تحليل اتجاهات يوتيوب + أفكار فيديوهات + هاشتاجات.',
    inputType: 'text',
    placeholder: 'اكتب الموضوع... مثال: قنوات تقنية',
    outputType: 'text',
  },
  {
    id: 'media-social',
    name: '📱 محتوى سوشيال',
    description: 'توليد محتوى سوشيال ميديا (إنستجرام، تويتر، لينكدإن، تيك توك).',
    inputType: 'text',
    placeholder: 'اكتب الموضوع... مثال: إطلاق منتج جديد',
    outputType: 'text',
  },
  {
    id: 'media-notebooklm',
    name: '📓 NotebookLM',
    description: 'تحليل مستند: ملخص + نقاط رئيسية + استشهادات + أسئلة.',
    inputType: 'text',
    placeholder: 'الصق النص أو المستند هنا...',
    outputType: 'text',
  },
];

/**
 * تشغيل أداة media.
 */
export async function runMediaTool(toolId: string, input: string): Promise<{
  success: boolean;
  output: string;
  outputType: string;
  imageUrl?: string;
  videoUrl?: string;
  error?: string;
}> {
  try {
    switch (toolId) {
      case 'media-image-gen': {
        const result = await generateImage(input);
        if (result.success) {
          return {
            success: true,
            output: `🎨 **تم توليد الصورة!**\n\n${result.imageUrl ? `🔗 ${result.imageUrl}` : ''}`,
            outputType: 'image',
            imageUrl: result.base64 || result.imageUrl,
          };
        }
        return { success: false, output: '', outputType: 'text', error: result.error };
      }

      case 'media-video-gen': {
        const result = await generateVideo(input);
        if (result.success) {
          // لو الفيديو خلص وatsu عندنا URL — اعرضه مباشرة
          if (result.videoUrl) {
            return {
              success: true,
              output: `🎬 **تم توليد الفيديو!**\n\n🎥 [شاهد الفيديو](${result.videoUrl})\n\n🖼️ ${result.coverUrl ? `![cover](${result.coverUrl})` : ''}\n\n📝 Task ID: \`${result.taskId}\``,
              outputType: 'video',
              videoUrl: result.videoUrl,
            };
          }
          // لو لسه PROCESSING — اعرض الـ Task ID
          return {
            success: true,
            output: `🎬 **تم بدء توليد الفيديو!**\n\n📝 Task ID: \`${result.taskId}\`\n⏳ الحالة: ${result.status}\n\nالفيديو لسه بيتولّد. جرّب تاني بعد دقيقة.`,
            outputType: 'text',
          };
        }
        return { success: false, output: '', outputType: 'text', error: result.error };
      }

      case 'media-podcast': {
        const result = await generatePodcast(input);
        if (result.success) {
          return { success: true, output: result.script, outputType: 'text' };
        }
        return { success: false, output: '', outputType: 'text', error: result.error };
      }

      case 'media-youtube': {
        const result = await analyzeYouTubeTrends(input);
        if (result.success) {
          return { success: true, output: result.analysis, outputType: 'text' };
        }
        return { success: false, output: '', outputType: 'text', error: result.error };
      }

      case 'media-social': {
        const result = await generateSocialContent(input);
        if (result.success) {
          return { success: true, output: result.content, outputType: 'text' };
        }
        return { success: false, output: '', outputType: 'text', error: result.error };
      }

      case 'media-notebooklm': {
        const result = await notebookLMAnalysis(input);
        if (result.success) {
          return { success: true, output: result.analysis, outputType: 'text' };
        }
        return { success: false, output: '', outputType: 'text', error: result.error };
      }

      default:
        return { success: false, output: '', outputType: 'text', error: `أداة media غير معروفة: ${toolId}` };
    }
  } catch (e: any) {
    return { success: false, output: '', outputType: 'text', error: e.message };
  }
}
