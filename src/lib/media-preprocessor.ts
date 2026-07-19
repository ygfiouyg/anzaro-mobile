/**
 * DeltaAI Media Preprocessor
 * 
 * Enables ALL models to understand images, videos, audio, and files
 * through preprocessing with vision/ASR services.
 * 
 * Flow:
 * - Images/Videos → Gemini Vision / ZhipuAI → Description text → injected into prompt
 * - Audio → ASR (Groq Whisper / ZAI SDK) → Transcript → injected into prompt
 * - PDFs → Text extraction (unpdf/pdf2json) → Text → injected into prompt
 * 
 * For vision-capable models (Gemini, GLM-4V), media is passed directly as multimodal content.
 * For non-vision models, media is preprocessed and the description/transcript is injected as text.
 */

import { generateGeminiVision } from '@/lib/gemini';
import { traceAPI, traceError } from '@/lib/trace-logger';
import { GROQ_API_KEY } from '@/lib/groq';

// ─── ZAI SDK Singleton ───────────────────────────────────────────────
declare global {
  var _zaiClientMediaPreprocessor: any;
}

async function getZAI() {
  if (!globalThis._zaiClientMediaPreprocessor) {
    const { getZAIClient } = await import('./zai-client');
    globalThis._zaiClientMediaPreprocessor = await getZAIClient();
  }
  return globalThis._zaiClientMediaPreprocessor;
}

// ─── Types ────────────────────────────────────────────────────────────

export interface MediaPreprocessResult {
  /** The type of media that was preprocessed */
  type: 'image' | 'video' | 'audio' | 'pdf';
  /** The original file name */
  name: string;
  /** The original file size string */
  size: string;
  /** The extracted text description or transcript */
  extractedText: string;
  /** Whether preprocessing succeeded */
  success: boolean;
  /** Error message if preprocessing failed */
  error?: string;
  /** The provider used for preprocessing */
  provider: string;
  /** The base64 data URL (kept for vision models that can use it directly) */
  dataUrl?: string;
}

export interface PreprocessedMedia {
  /** Results for all preprocessed media */
  results: MediaPreprocessResult[];
  /** Combined text from all preprocessed media */
  combinedText: string;
  /** Whether any media had images (for vision models to use directly) */
  hasImages: boolean;
  /** Image data URLs for vision models */
  imageDataUrls: string[];
  /** Whether any video was included */
  hasVideos: boolean;
  /** Video data URLs for vision models */
  videoDataUrls: string[];
}

// ─── Image Analysis ──────────────────────────────────────────────────

/**
 * Analyze an image using Gemini Vision (primary) or ZhipuAI (fallback).
 * Returns a detailed text description of the image.
 */
async function analyzeImage(
  imageBase64DataUrl: string,
  userPrompt: string
): Promise<{ description: string; provider: string }> {
  // Extract base64 data and mime type
  let base64Data = '';
  let mimeType = 'image/jpeg';

  if (imageBase64DataUrl.startsWith('data:')) {
    const matches = imageBase64DataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (matches) {
      mimeType = matches[1];
      base64Data = matches[2];
    }
  } else {
    base64Data = imageBase64DataUrl;
  }

  if (!base64Data) {
    throw new Error('No image data provided');
  }

  // ── Primary: Gemini Vision ──
  try {
    traceAPI(`[MediaPreprocessor] Gemini Vision: تحليل صورة...`);
    const analysisPrompt = userPrompt 
      ? `المستخدم أرفق صورة وسأل: "${userPrompt}". حلل الصورة بالتفصيل وأجب على سؤاله بالعربية.`
      : 'حلل هذه الصورة بالتفصيل. صف كل ما تراه: الأشياء، الأشخاص، الألوان، النصوص، المشهد العام. أجب بالعربية.';

    const result = await generateGeminiVision({
      prompt: analysisPrompt,
      imageBase64: base64Data,
      imageMimeType: mimeType,
      model: 'gemini-2.5-flash-preview-05-20',
    });

    traceAPI(`[MediaPreprocessor] Gemini Vision نجح`);
    return { description: result.text, provider: 'gemini-vision' };
  } catch (geminiError) {
    traceError(`[MediaPreprocessor] Gemini Vision فشل: ${geminiError instanceof Error ? geminiError.message.slice(0, 100) : 'خطأ'}`);
  }

  // ── Fallback: ZhipuAI Vision ──
  try {
    traceAPI(`[MediaPreprocessor] ZhipuAI Vision: تحليل صورة...`);
    const zai = await getZAIClient();
    
    const analysisPrompt = userPrompt 
      ? `المستخدم أرفق صورة وسأل: "${userPrompt}". حلل الصورة بالتفصيل وأجب على سؤاله.`
      : 'حلل هذه الصورة بالتفصيل. صف كل ما تراه.';

    const dataUrl = imageBase64DataUrl.startsWith('data:')
      ? imageBase64DataUrl
      : `data:${mimeType};base64,${imageBase64DataUrl}`;

    const result = await zai.chat.completions.createVision({
      model: 'glm-4v-flash',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: analysisPrompt },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
      thinking: { type: 'disabled' },
    });

    let responseText = '';
    if (result?.choices?.[0]?.message?.content) {
      responseText = result.choices[0].message.content;
    } else if (typeof result === 'string') {
      responseText = result;
    }

    if (responseText) {
      traceAPI(`[MediaPreprocessor] ZhipuAI Vision نجح`);
      return { description: responseText, provider: 'zhipuai-vision' };
    }
  } catch (zhipuaiError) {
    traceError(`[MediaPreprocessor] ZhipuAI Vision فشل: ${zhipuaiError instanceof Error ? zhipuaiError.message.slice(0, 100) : 'خطأ'}`);
  }

  throw new Error('فشل تحليل الصورة مع جميع مزودي الرؤية');
}

// ─── Video Analysis ──────────────────────────────────────────────────

/**
 * Analyze a video using ZhipuAI Vision (supports video_url).
 * For large videos, we analyze key frames using Gemini Vision.
 */
async function analyzeVideo(
  videoBase64DataUrl: string,
  userPrompt: string
): Promise<{ description: string; provider: string }> {
  // ZhipuAI supports video_url in vision API
  try {
    traceAPI(`[MediaPreprocessor] ZhipuAI Vision: تحليل فيديو...`);
    const zai = await getZAIClient();
    
    const analysisPrompt = userPrompt 
      ? `المستخدم أرفق فيديو وسأل: "${userPrompt}". حلل محتوى الفيديو بالتفصيل وأجب على سؤاله بالعربية.`
      : 'حلل هذا الفيديو بالتفصيل. صف ما يحدث فيه، المشاهد، الأشخاص، والأحداث. أجب بالعربية.';

    const result = await zai.chat.completions.createVision({
      model: 'glm-4v-flash',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: analysisPrompt },
            { type: 'video_url', video_url: { url: videoBase64DataUrl } },
          ],
        },
      ],
      thinking: { type: 'disabled' },
    });

    let responseText = '';
    if (result?.choices?.[0]?.message?.content) {
      responseText = result.choices[0].message.content;
    } else if (typeof result === 'string') {
      responseText = result;
    }

    if (responseText) {
      traceAPI(`[MediaPreprocessor] ZhipuAI Vision (فيديو) نجح`);
      return { description: responseText, provider: 'zhipuai-video' };
    }
  } catch (zhipuaiError) {
    traceError(`[MediaPreprocessor] ZhipuAI Vision (فيديو) فشل: ${zhipuaiError instanceof Error ? zhipuaiError.message.slice(0, 100) : 'خطأ'}`);
  }

  // Fallback: Try Gemini with video frames
  try {
    traceAPI(`[MediaPreprocessor] Gemini Vision: تحليل فيديو...`);
    const analysisPrompt = userPrompt 
      ? `المستخدم أرفق فيديو وسأل: "${userPrompt}". حلل محتوى الفيديو بالتفصيل.`
      : 'حلل هذا الفيديو بالتفصيل.';

    // For Gemini, we pass the video as a file
    const result = await generateGeminiVision({
      prompt: analysisPrompt,
      imageBase64: videoBase64DataUrl.split(',')[1] || videoBase64DataUrl,
      imageMimeType: 'video/mp4',
      model: 'gemini-2.5-flash-preview-05-20',
    });

    traceAPI(`[MediaPreprocessor] Gemini Vision (فيديو) نجح`);
    return { description: result.text, provider: 'gemini-video' };
  } catch (geminiError) {
    traceError(`[MediaPreprocessor] Gemini Vision (فيديو) فشل: ${geminiError instanceof Error ? geminiError.message.slice(0, 100) : 'خطأ'}`);
  }

  throw new Error('فشل تحليل الفيديو مع جميع المزودين');
}

// ─── Audio Transcription ─────────────────────────────────────────────

/**
 * Transcribe audio using Groq Whisper (primary) or ZAI SDK (fallback).
 */
async function transcribeAudio(
  audioBase64DataUrl: string,
  language: string = 'ar'
): Promise<{ transcript: string; provider: string }> {
  // Extract base64 data
  let base64Data = '';
  let mimeType = 'audio/wav';

  if (audioBase64DataUrl.startsWith('data:')) {
    const matches = audioBase64DataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (matches) {
      mimeType = matches[1];
      base64Data = matches[2];
    }
  } else {
    base64Data = audioBase64DataUrl;
  }

  if (!base64Data) {
    throw new Error('No audio data provided');
  }

  // Convert base64 to buffer
  const audioBuffer = Buffer.from(base64Data, 'base64');

  // Determine file extension from mime type
  const extMap: Record<string, string> = {
    'audio/wav': 'wav',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/mp4': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/ogg': 'ogg',
    'audio/flac': 'flac',
    'audio/webm': 'webm',
    'audio/x-webm': 'webm',
  };
  const ext = extMap[mimeType] || 'wav';
  const fileName = `audio.${ext}`;

  // ── Primary: Groq Whisper (fastest, ~200ms) ──
  if (GROQ_API_KEY) {
    try {
      traceAPI(`[MediaPreprocessor] Groq Whisper: تفريغ صوت...`);
      
      const audioBlob = new Blob([audioBuffer], { type: mimeType });
      const groqFormData = new FormData();
      groqFormData.append('file', audioBlob, fileName);
      groqFormData.append('model', 'whisper-large-v3');
      groqFormData.append('language', language);
      groqFormData.append('response_format', 'json');

      const groqResponse = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
        },
        body: groqFormData,
        signal: AbortSignal.timeout(15_000),
      });

      if (groqResponse.ok) {
        const groqResult = await groqResponse.json();
        const groqText = groqResult.text?.trim();
        if (groqText) {
          traceAPI(`[MediaPreprocessor] Groq Whisper نجح (${groqText.length} حرف)`);
          return { transcript: groqText, provider: 'groq-whisper' };
        }
      }
    } catch (groqErr) {
      traceError(`[MediaPreprocessor] Groq Whisper فشل: ${groqErr instanceof Error ? groqErr.message.slice(0, 100) : 'خطأ'}`);
    }
  }

  // ── Fallback: ZAI SDK ASR ──
  try {
    traceAPI(`[MediaPreprocessor] ZAI SDK ASR: تفريغ صوت...`);
    const zai = await getZAIClient();

    const result = await zai.audio.asr.create({
      file: audioBase64DataUrl,
      language,
    });

    let text = '';
    if (typeof result === 'string') {
      text = result;
    } else if (result?.text) {
      text = result.text;
    } else if (result?.data?.text) {
      text = result.data.text;
    } else if (Array.isArray(result)) {
      text = result.map((item: any) => item.text || item.content || '').join(' ');
    }

    if (text.trim()) {
      traceAPI(`[MediaPreprocessor] ZAI SDK ASR نجح (${text.length} حرف)`);
      return { transcript: text, provider: 'zai-asr' };
    }
  } catch (zaiErr) {
    traceError(`[MediaPreprocessor] ZAI SDK ASR فشل: ${zaiErr instanceof Error ? zaiErr.message.slice(0, 100) : 'خطأ'}`);
  }

  throw new Error('فشل تفريغ الصوت مع جميع المزودين');
}

// ─── Main Preprocessing Function ─────────────────────────────────────

export interface ParsedMediaAttachment {
  type: 'image' | 'video' | 'audio' | 'pdf' | 'text';
  name: string;
  size: string;
  content?: string; // base64 data URL for images/videos/audio/PDFs, text content for text files
  textContent?: string; // extracted text from PDFs
}

/**
 * Preprocess all media attachments for a chat message.
 * 
 * For non-vision models: Returns text descriptions/transcripts that can be
 * injected into the text prompt.
 * 
 * For vision models: Returns the data URLs that can be passed as multimodal content.
 */
export async function preprocessMediaAttachments(
  attachments: ParsedMediaAttachment[],
  userPrompt: string,
  isVisionModel: boolean,
  language: string = 'ar'
): Promise<PreprocessedMedia> {
  const results: MediaPreprocessResult[] = [];
  const imageDataUrls: string[] = [];
  const videoDataUrls: string[] = [];
  const textParts: string[] = [];

  for (const att of attachments) {
    try {
      switch (att.type) {
        case 'image': {
          if (!att.content) {
            results.push({
              type: 'image',
              name: att.name,
              size: att.size,
              extractedText: '',
              success: false,
              error: 'لا توجد بيانات صورة',
              provider: 'none',
            });
            break;
          }

          // For vision models, keep the data URL for direct multimodal use
          if (isVisionModel) {
            imageDataUrls.push(att.content);
          }

          // For ALL models (including vision), also get a text description
          // This ensures the text model can reference the image content
          try {
            const { description, provider } = await analyzeImage(att.content, userPrompt);
            textParts.push(`📷 صورة مرفقة: ${att.name} (${att.size})\n--- وصف الصورة ---\n${description}\n--- نهاية الوصف ---`);
            results.push({
              type: 'image',
              name: att.name,
              size: att.size,
              extractedText: description,
              success: true,
              provider,
              dataUrl: att.content,
            });
          } catch (imgErr) {
            const errorMsg = imgErr instanceof Error ? imgErr.message : 'فشل تحليل الصورة';
            textParts.push(`📷 صورة مرفقة: ${att.name} (${att.size})\n⚠️ ${errorMsg}`);
            results.push({
              type: 'image',
              name: att.name,
              size: att.size,
              extractedText: '',
              success: false,
              error: errorMsg,
              provider: 'failed',
              dataUrl: att.content,
            });
          }
          break;
        }

        case 'video': {
          if (!att.content) {
            results.push({
              type: 'video',
              name: att.name,
              size: att.size,
              extractedText: '',
              success: false,
              error: 'لا توجد بيانات فيديو',
              provider: 'none',
            });
            break;
          }

          // For vision models, keep the data URL
          if (isVisionModel) {
            videoDataUrls.push(att.content);
          }

          // Analyze video content
          try {
            const { description, provider } = await analyzeVideo(att.content, userPrompt);
            textParts.push(`🎬 فيديو مرفق: ${att.name} (${att.size})\n--- وصف الفيديو ---\n${description}\n--- نهاية الوصف ---`);
            results.push({
              type: 'video',
              name: att.name,
              size: att.size,
              extractedText: description,
              success: true,
              provider,
              dataUrl: att.content,
            });
          } catch (vidErr) {
            const errorMsg = vidErr instanceof Error ? vidErr.message : 'فشل تحليل الفيديو';
            textParts.push(`🎬 فيديو مرفق: ${att.name} (${att.size})\n⚠️ ${errorMsg}`);
            results.push({
              type: 'video',
              name: att.name,
              size: att.size,
              extractedText: '',
              success: false,
              error: errorMsg,
              provider: 'failed',
              dataUrl: att.content,
            });
          }
          break;
        }

        case 'audio': {
          if (!att.content) {
            results.push({
              type: 'audio',
              name: att.name,
              size: att.size,
              extractedText: '',
              success: false,
              error: 'لا توجد بيانات صوت',
              provider: 'none',
            });
            break;
          }

          // Transcribe audio
          try {
            const { transcript, provider } = await transcribeAudio(att.content, language);
            textParts.push(`🎵 ملف صوتي مرفق: ${att.name} (${att.size})\n--- تفريغ الصوت ---\n${transcript}\n--- نهاية التفريغ ---`);
            results.push({
              type: 'audio',
              name: att.name,
              size: att.size,
              extractedText: transcript,
              success: true,
              provider,
            });
          } catch (audErr) {
            const errorMsg = audErr instanceof Error ? audErr.message : 'فشل تفريغ الصوت';
            textParts.push(`🎵 ملف صوتي مرفق: ${att.name} (${att.size})\n⚠️ ${errorMsg}`);
            results.push({
              type: 'audio',
              name: att.name,
              size: att.size,
              extractedText: '',
              success: false,
              error: errorMsg,
              provider: 'failed',
            });
          }
          break;
        }

        case 'pdf': {
          // PDFs are handled separately by extractTextFromPdfBase64 in the stream route
          // Just note that we have a PDF
          textParts.push(`📄 ملف PDF مرفق: ${att.name} (${att.size})`);
          results.push({
            type: 'pdf',
            name: att.name,
            size: att.size,
            extractedText: att.textContent || '',
            success: true,
            provider: 'pdf-extraction',
            dataUrl: att.content,
          });
          break;
        }

        case 'text': {
          // Text files are already inline
          if (att.textContent) {
            textParts.push(`📎 ملف مرفق: ${att.name} (${att.size})\n--- محتوى الملف ---\n${att.textContent}\n--- نهاية الملف ---`);
          }
          results.push({
            type: 'text' as any,
            name: att.name,
            size: att.size,
            extractedText: att.textContent || '',
            success: true,
            provider: 'text-inline',
          });
          break;
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'خطأ غير معروف';
      textParts.push(`📁 ملف مرفق: ${att.name} (${att.size})\n⚠️ فشل المعالجة: ${errorMsg}`);
      results.push({
        type: att.type as any,
        name: att.name,
        size: att.size,
        extractedText: '',
        success: false,
        error: errorMsg,
        provider: 'error',
      });
    }
  }

  return {
    results,
    combinedText: textParts.join('\n\n'),
    hasImages: imageDataUrls.length > 0,
    imageDataUrls,
    hasVideos: videoDataUrls.length > 0,
    videoDataUrls,
  };
}
