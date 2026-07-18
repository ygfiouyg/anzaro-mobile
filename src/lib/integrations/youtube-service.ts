/**
 * YouTube Service — تحليل فيديوهات YouTube بدون ytdl-core
 * ========================================================
 * بيستخدم fetch مباشر لصفحة YouTube لاستخراج:
 * - معلومات الفيديو (title, author, description)
 * - transcript (من captions)
 * - تحليل بالـ GLM-5.2
 */

import { getZAIClient } from '@/lib/zai-client';

export interface YouTubeResult {
  success: boolean;
  videoInfo?: {
    title: string;
    author: string;
    lengthSeconds: number;
    viewCount: number;
    description: string;
    thumbnail: string;
  };
  transcript?: string;
  analysis?: string;
  error?: string;
}

/**
 * استخراج video ID من أي رابط YouTube
 */
function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([^&\n?#]+)/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

/**
 * تحليل فيديو YouTube
 */
export async function analyzeYouTubeVideo(url: string, question?: string): Promise<YouTubeResult> {
  try {
    const videoId = extractVideoId(url);
    if (!videoId) {
      return { success: false, error: 'رابط YouTube غير صحيح' };
    }

    // 1. استخراج معلومات الفيديو من oEmbed (API رسمي ومجاني)
    const oembedRes = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      { signal: AbortSignal.timeout(15_000) }
    );
    
    if (!oembedRes.ok) {
      return { success: false, error: `فشل الحصول على معلومات الفيديو (${oembedRes.status})` };
    }
    
    const oembed = await oembedRes.json();
    
    const videoInfo = {
      title: oembed.title || 'بدون عنوان',
      author: oembed.author_name || 'غير معروف',
      lengthSeconds: 0, // غير متاح في oEmbed
      viewCount: 0, // غير متاح في oEmbed
      description: '', // هنحاول نجيبها من الـ page
      thumbnail: oembed.thumbnail_url || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    };

    // 2. محاولة استخراج الـ transcript من timedtext API
    let transcript = '';
    try {
      // نجرب نحمل صفحة الفيديو ونستخرج caption tracks
      const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout(20_000),
      });
      const pageHtml = await pageRes.text();
      
      // استخراج caption tracks
      const captionMatch = pageHtml.match(/"captionTracks":\s*(\[^\]]+\])/);
      if (captionMatch) {
        const captionTracks = JSON.parse(captionMatch[1].replace(/\\u0026/g, '&'));
        if (captionTracks.length > 0) {
          const captionUrl = captionTracks[0].baseUrl;
          const capRes = await fetch(captionUrl, { signal: AbortSignal.timeout(15_000) });
          const capText = await capRes.text();
          transcript = capText
            .replace(/<[^>]+>/g, ' ')
            .replace(/&amp;quot;/g, '"')
            .replace(/&amp;#39;/g, "'")
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 15000);
        }
      }
      
      // استخراج description من الـ page
      const descMatch = pageHtml.match(/"shortDescription":"([^"]+)"/);
      if (descMatch) {
        videoInfo.description = descMatch[1].replace(/\\n/g, '\n').slice(0, 2000);
      }
      
      // استخراج lengthSeconds
      const lenMatch = pageHtml.match(/"lengthSeconds":"(\d+)"/);
      if (lenMatch) {
        videoInfo.lengthSeconds = parseInt(lenMatch[1]);
      }
      
      // استخراج viewCount
      const viewMatch = pageHtml.match(/"viewCount":"(\d+)"/);
      if (viewMatch) {
        videoInfo.viewCount = parseInt(viewMatch[1]);
      }
    } catch {
      // مش مشكلة لو الـ transcript مش متاح
    }

    // 3. تحليل بـ GLM-5.2
    const zai = await getZAIClient();
    const prompt = question
      ? `بناء على معلومات الفيديو ده، رد على السؤال:

عنوان الفيديو: ${videoInfo.title}
القناة: ${videoInfo.author}
المدة: ${videoInfo.lengthSeconds} ثانية
المشاهدات: ${videoInfo.viewCount}
الوصف: ${videoInfo.description}
${transcript ? `\nالنص:\n${transcript}` : ''}

السؤال: ${question}`
      : `حلل الفيديو ده واعمل:
1. 📝 ملخص شامل
2. 🔑 النقاط الرئيسية
3. 💡 الأفكار المهمة
4. 🎯 الجمهور المستهدف
5. ⭐ تقييم الجودة

عنوان الفيديو: ${videoInfo.title}
القناة: ${videoInfo.author}
المدة: ${videoInfo.lengthSeconds} ثانية
المشاهدات: ${videoInfo.viewCount}
الوصف: ${videoInfo.description}
${transcript ? `\nالنص:\n${transcript}` : ''}`;

    const completion = await zai.chat.completions.create({
      model: 'glm-5.2',
      messages: [
        { role: 'system', content: 'أنت محلل محتوى YouTube محترف. اعمل تحليل احترافي ومنظم.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 4096,
      temperature: 0.7,
    });

    const analysis = completion?.choices?.[0]?.message?.content || '';

    return {
      success: true,
      videoInfo,
      transcript: transcript || undefined,
      analysis,
    };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}
