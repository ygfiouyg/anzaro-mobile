// ═══════════════════════════════════════════════════════════════════════
// AI Tool Definition: play_media
// ═══════════════════════════════════════════════════════════════════════
// When the user asks to play audio (Radio, Spotify, YouTube, TTS),
// the AI uses this tool instead of replying with text.
// The tool returns a structured mediaWidget JSON object.
// ═══════════════════════════════════════════════════════════════════════

export interface MediaWidget {
  type: 'audio' | 'video';
  source: 'radio' | 'spotify' | 'youtube' | 'tts';
  title: string;
  streamUrl?: string;
  audioData?: string; // Base64 for TTS
  mimeType?: string;
  autoPlay: boolean;
  duration?: number;
  thumbnail?: string;
}

export interface PlayMediaParams {
  query: string;
  source: 'radio' | 'spotify' | 'youtube' | 'tts' | 'auto';
}

export const playMediaTool = {
  name: 'play_media',
  description: 'تشغيل وسائط صوتية (راديو، أغنية، يوتيوب، نص لصوت). استخدم هذه الأداة عندما يطلب المستخدم تشغيل أي صوت بدلاً من الرد النصي.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'اسم المحطة أو الأغنية أو الفيديو أو النص المراد تحويله لصوت',
      },
      source: {
        type: 'string',
        enum: ['radio', 'spotify', 'youtube', 'tts', 'auto'],
        description: 'مصدر الصوت: radio للراديو، spotify للأغاني، youtube للفيديو، tts لتحويل النص لصوت، auto للاكتشاف التلقائي',
        default: 'auto',
      },
    },
    required: ['query'],
  },
};

/**
 * Detect the media source from the user's query (Arabic + English).
 */
export function detectMediaSource(query: string): PlayMediaParams['source'] {
  const q = query.toLowerCase();
  // Radio keywords
  if (/راديو|إذاعة|اذاعة|radio|station|قرآن|قران|quran|mbc|نجوم|شباب/i.test(q)) {
    return 'radio';
  }
  // Spotify keywords
  if (/spotify|سبوتيفاي|أغني|اغني|song|music|موسيقى|انشوده|أنشوده|نشيد|نشيده|اناشيد|أناشيد/i.test(q)) {
    return 'spotify';
  }
  // YouTube keywords
  if (/youtube|يوتيوب|فيديو|video|قناة|channel|مقطع|كليب/i.test(q)) {
    return 'youtube';
  }
  // Default: TTS (read text aloud)
  return 'tts';
}

/**
 * Build a mediaWidget response for the frontend.
 */
export function buildMediaWidget(params: {
  source: MediaWidget['source'];
  title: string;
  streamUrl?: string;
  audioData?: string;
  mimeType?: string;
  autoPlay?: boolean;
  duration?: number;
  thumbnail?: string;
}): MediaWidget {
  return {
    type: 'audio',
    source: params.source,
    title: params.title,
    streamUrl: params.streamUrl,
    audioData: params.audioData,
    mimeType: params.mimeType || 'audio/mpeg',
    autoPlay: params.autoPlay ?? true,
    duration: params.duration,
    thumbnail: params.thumbnail,
  };
}
