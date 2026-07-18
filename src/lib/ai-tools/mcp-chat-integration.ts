/**
 * MCP Chat Integration
 * ====================
 * بيكتشف نية المستخدم (intent) ويشغّل أداة MCP مناسبة قبل ما يبعت لـ GLM.
 *
 * أمثلة:
 *   "ابحث عن أحدث أخبار AI" → mcp-web-search
 *   "اقرأ اللينك ده https://..." → mcp-page-reader
 *   "ابحث عن صور قطط" → mcp-image-search
 *   "نفّذ الكود ده: console.log('hi')" → mcp-code-exec
 *   "افتكر شنو قلت عن القهوة" → mcp-memory (chat_search)
 */

import { mcpWebSearch, mcpPageReader, mcpImageSearch, mcpCodeExec, mcpMemory, runMCPTool } from './mcp-tools';
import { runVisionTool } from './vision-tools';
import { runMediaTool } from './media-tools';
import { runAgentTool } from './agent-tools';
import { runRAGTool } from './rag-tools';
import { runBusinessTool } from './business-tools';
import { runCompareTool } from './compare-tools';
import { runAudioTool } from './audio-tools';
import { runAdvRAGTool } from './adv-rag-tools';
import { runAdvAgentTool } from './adv-agent-tools';

export interface MCPIntentResult {
  matched: boolean;
  tool?: string;
  input?: string;
  result?: string;
  error?: string;
}

/**
 * كشف نية المستخدم وتشغيل أداة MCP لو محتاجة.
 */
export async function detectAndRunMCP(message: string): Promise<MCPIntentResult> {
  const lower = message.toLowerCase().trim();

  // ═══════════════════════════════════════════
  // 1. Web Search — لو المستخدم طلب بحث
  // ═══════════════════════════════════════════
  const searchPatterns = [
    /^ابحث\s+(?:عن|في)\s+(.+)/i,
    /^دور\s+(?:عن|على)\s+(.+)/i,
    /^بحث\s*:\s*(.+)/i,
    /^search\s+(?:for\s+)?(.+)/i,
    /^find\s+(.+)/i,
    /^google\s+(.+)/i,
    /^شنو\s+(.+)/i,
    /^ايه\s+هو\s+(.+)/i,
    /^معلومات\s+عن\s+(.+)/i,
    /^اخبار\s+(.+)/i,
    /^أخبار\s+(.+)/i,
  ];

  for (const pattern of searchPatterns) {
    const match = message.match(pattern);
    if (match) {
      const query = match[1].trim();
      const result = await mcpWebSearch(query, 5);
      if (result.success && result.results.length > 0) {
        const formatted = result.results.map((r, i) =>
          `${i + 1}. **${r.title}**\n   🔗 ${r.url}\n   ${r.snippet}`
        ).join('\n\n');
        return {
          matched: true,
          tool: 'mcp-web-search',
          input: query,
          result: `🔍 **نتائج البحث عن: "${query}"**\n\n${formatted}`,
        };
      }
      return { matched: true, tool: 'mcp-web-search', input: query, error: 'مفيش نتائج' };
    }
  }

  // ═══════════════════════════════════════════
  // 2. Page Reader — لو المستخدم بعت لينك
  // ═══════════════════════════════════════════
  const urlMatch = message.match(/https?:\/\/[^\s]+/);
  if (urlMatch) {
    const url = urlMatch[0];
    const readPatterns = [
      /اقرأ|اقرا|read| summary|لخص|ملخص|شرح|explain|حلل|analyze/i,
    ];

    // لو فيه لينك + طلب قراءة/تلخيص/تحليل
    const wantsRead = readPatterns.some(p => p.test(lower)) ||
                      lower.includes('اللينك') ||
                      lower.includes('الرابط') ||
                      lower.includes('ده') ||
                      lower.includes('هذا') ||
                      message.length < url.length + 30; // رسالة قصيرة = غالباً بس اللينك

    if (wantsRead) {
      const result = await mcpPageReader(url);
      if (result.success) {
        const content = (result.content || '').slice(0, 3000);
        return {
          matched: true,
          tool: 'mcp-page-reader',
          input: url,
          result: `📄 **${result.title}**\n🔗 ${url}\n\n${content}`,
        };
      }
      return { matched: true, tool: 'mcp-page-reader', input: url, error: result.error || 'فشل القراءة' };
    }
  }

  // ═══════════════════════════════════════════
  // 3. Image Search — لو المستخدم طلب صور
  // ═══════════════════════════════════════════
  const imagePatterns = [
    /(?:ابحث|دور)\s+(?:عن\s+)?صور(?:ة|ة)?\s+(.+)/i,
    /صور(?:ة)?\s+(?:ل|de|of)\s+(.+)/i,
    /search\s+(?:for\s+)?images?\s+(?:of\s+)?(.+)/i,
    /find\s+(?:me\s+)?(?:a\s+)?images?\s+(?:of\s+)?(.+)/i,
    /اريني\s+صور(?:ة)?\s+(?:ل|de|of)?\s*(.+)/i,
    /وريني\s+صور(?:ة)?\s+(?:ل|de|of)?\s*(.+)/i,
    /images?\s+(?:of|for)\s+(.+)/i,
  ];

  for (const pattern of imagePatterns) {
    const match = message.match(pattern);
    if (match) {
      const query = match[1].trim();
      const result = await mcpImageSearch(query, 4);
      if (result.success && result.images.length > 0) {
        const formatted = result.images.map((img, i) =>
          `${i + 1}. ${img.caption || ''}\n   🔗 ${img.url}`
        ).join('\n\n');
        return {
          matched: true,
          tool: 'mcp-image-search',
          input: query,
          result: `🖼️ **صور عن: "${query}"**\n\n${formatted}`,
        };
      }
      return { matched: true, tool: 'mcp-image-search', input: query, error: 'مفيش صور' };
    }
  }

  // ═══════════════════════════════════════════
  // 4. Code Exec — لو المستخدم طلب تشغيل كود
  // ═══════════════════════════════════════════
  const codePatterns = [
    /نفّذ\s*(?:الكود|الكود ده)\s*:?\s*([\s\S]+)/i,
    /نفذ\s*(?:الكود|الكود ده)\s*:?\s*([\s\S]+)/i,
    /شغّل\s*(?:الكود|الكود ده)\s*:?\s*([\s\S]+)/i,
    /شغل\s*(?:الكود|الكود ده)\s*:?\s*([\s\S]+)/i,
    /run\s+(?:this\s+)?code\s*:?\s*([\s\S]+)/i,
    /execute\s+(?:this\s+)?code\s*:?\s*([\s\S]+)/i,
    /```(?:js|javascript)?\n([\s\S]+?)```/i,
  ];

  for (const pattern of codePatterns) {
    const match = message.match(pattern);
    if (match) {
      const code = match[1].trim();
      const result = await mcpCodeExec(code, 10000);
      if (result.success) {
        return {
          matched: true,
          tool: 'mcp-code-exec',
          input: code,
          result: `💻 **نتيجة تنفيذ الكود:**\n\n\`\`\`\n${result.output}\n\`\`\``,
        };
      }
      return {
        matched: true,
        tool: 'mcp-code-exec',
        input: code,
        result: `💻 **نتيجة تنفيذ الكود:**\n\n\`\`\`\n${result.output}\n\`\`\`\n❌ خطأ: ${result.error}`,
        error: result.error,
      };
    }
  }

  // ═══════════════════════════════════════════
  // 5. Memory — لو المستخدم طلب تذكر
  // ═══════════════════════════════════════════
  const memoryPatterns = [
    /(?:افتكر|تفتكر|فكرني)\s+(.+)/i,
    /افتكر\s+اسمي/i,
    /شنو\s+قلت\s+(?:عن|في)\s+(.+)/i,
    /ايه\s+اللي\s+قلته\s+(?:عن|في)\s+(.+)/i,
    /ماذا\s+قلت\s+(?:عن|في)\s+(.+)/i,
    /اسمي\s+ايه/i,
    /اسمي\s+شنو/i,
    /من\s+انا/i,
    /من\s+أنا/i,
    /remember\s+(.+)/i,
    /what\s+did\s+you\s+(?:say|tell)\s+(?:about|regarding)\s+(.+)/i,
    /what\s+is\s+my\s+name/i,
  ];

  for (const pattern of memoryPatterns) {
    const match = message.match(pattern);
    if (match) {
      const query = match[1] ? match[1].trim() : 'اسم';
      const result = await runMCPTool('mcp-memory', `chat_search|${query}`);
      if (result.success && result.output && !result.output.includes('مفيش نتائج')) {
        return {
          matched: true,
          tool: 'mcp-memory',
          input: query,
          result: `🧠 **ذاكرتي عن: "${query}"**\n\n${result.output}`,
        };
      }
      // لو مفيش نتائج في الذاكرة، سيب GLM يرد
      return { matched: false };
    }
  }

  // ═══════════════════════════════════════════
  // 6. Memory save — حفظ تلقائي
  // ═══════════════════════════════════════════
  const savePatterns = [
    /احفظ\s+(?:ان|أن)\s+(.+)/i,
    /تذكر\s+(?:ان|أن)\s+(.+)/i,
    /تذكر\s+إن\s+(.+)/i,
    /اسمي\s+(.+)/i,
    /save\s+(?:that\s+)?(.+)/i,
    /remember\s+(?:that\s+)?(.+)/i,
    /my\s+name\s+is\s+(.+)/i,
  ];

  for (const pattern of savePatterns) {
    const match = message.match(pattern);
    if (match) {
      const fact = match[1].trim();
      const result = await runMCPTool('mcp-memory', `save|fact|${fact}`);
      return {
        matched: true,
        tool: 'mcp-memory',
        input: fact,
        result: `🧠 ✅ ${result.output}`,
      };
    }
  }

  // ═══════════════════════════════════════════
  // 7. Image Generation — توليد صورة
  // ═══════════════════════════════════════════
  // ملاحظة: بنستثني "فيديو" و "بودكاست" و "ريلز" من الـ image patterns
  // عشان الـ video gen patterns تلتقطها بدل ذلك
  const imageGenPatterns = [
    /(?:ارسم|ولّد|اصنع|انشاء)\s+(?:لي\s+)?صور(?:ة)?\s+(.+)/i,
    /(?:ارسم|اصنع)\s+(.+)/i,
    /ولّد\s+(?!فيديو|بودكاست|ريلز|فديو)(.+)/i,
    /generate\s+(?:an?\s+)?image\s+(?:of\s+)?(.+)/i,
    /draw\s+(.+)/i,
    /صورة\s+(?:ل|de|of)\s+(.+)/i,
    /اريني\s+صور(?:ة)?\s+(?:ل|de|of)?\s*(.+)/i,
  ];

  for (const pattern of imageGenPatterns) {
    const match = message.match(pattern);
    if (match) {
      const prompt = match[1].trim();
      const result = await runMediaTool('media-image-gen', prompt);
      if (result.success) {
        return {
          matched: true,
          tool: 'media-image-gen',
          input: prompt,
          result: result.output + (result.imageUrl ? `\n\n![generated](${result.imageUrl})` : ''),
        };
      }
      return { matched: true, tool: 'media-image-gen', input: prompt, error: result.error };
    }
  }

  // ═══════════════════════════════════════════
  // 8. Video Generation — توليد فيديو
  // ═══════════════════════════════════════════
  const videoGenPatterns = [
    /(?:ولّد|اصنع|انشاء)\s+(?:لي\s+)?فيديو\s+(.+)/i,
    /generate\s+(?:a\s+)?video\s+(?:of\s+)?(.+)/i,
    /make\s+(?:a\s+)?video\s+(?:of\s+)?(.+)/i,
    /فيديو\s+(?:ل|عن)\s+(.+)/i,
  ];

  for (const pattern of videoGenPatterns) {
    const match = message.match(pattern);
    if (match) {
      const prompt = match[1].trim();
      const result = await runMediaTool('media-video-gen', prompt);
      if (result.success) {
        return { matched: true, tool: 'media-video-gen', input: prompt, result: result.output };
      }
      return { matched: true, tool: 'media-video-gen', input: prompt, error: result.error };
    }
  }

  // ═══════════════════════════════════════════
  // 9. Podcast — توليد بودكاست
  // ═══════════════════════════════════════════
  const podcastPatterns = [
    /(?:اعمل|ولّد|اصنع)\s+(?:لي\s+)?بودكاست\s+(?:عن|ل)\s+(.+)/i,
    /بودكاست\s+(?:عن|ل)\s+(.+)/i,
    /make\s+(?:a\s+)?podcast\s+(?:about|on)\s+(.+)/i,
    /podcast\s+(?:about|on)\s+(.+)/i,
  ];

  for (const pattern of podcastPatterns) {
    const match = message.match(pattern);
    if (match) {
      const topic = match[1].trim();
      const result = await runMediaTool('media-podcast', topic);
      if (result.success) {
        return { matched: true, tool: 'media-podcast', input: topic, result: `🎙️ **بودكاست عن: ${topic}**\n\n${result.output}` };
      }
      return { matched: true, tool: 'media-podcast', input: topic, error: result.error };
    }
  }

  // ═══════════════════════════════════════════
  // 10. YouTube — تحليل يوتيوب
  // ═══════════════════════════════════════════
  const youtubePatterns = [
    /(?:حلل|اعمل)\s+(?:تحليل\s+)?يوتيوب\s+(?:عن|ل)\s+(.+)/i,
    /اتجاهات\s+يوتيوب\s+(?:عن|ل)\s+(.+)/i,
    /youtube\s+(?:trends?|analysis)\s+(?:about|on|for)\s+(.+)/i,
  ];

  for (const pattern of youtubePatterns) {
    const match = message.match(pattern);
    if (match) {
      const topic = match[1].trim();
      const result = await runMediaTool('media-youtube', topic);
      if (result.success) {
        return { matched: true, tool: 'media-youtube', input: topic, result: `📈 **تحليل يوتيوب: ${topic}**\n\n${result.output}` };
      }
      return { matched: true, tool: 'media-youtube', input: topic, error: result.error };
    }
  }

  // ═══════════════════════════════════════════
  // 11. Social Content — محتوى سوشيال
  // ═══════════════════════════════════════════
  const socialPatterns = [
    /(?:اكتب|اعمل)\s+(?:لي\s+)?(?:بوست|محتوى)\s+(?:انستجرام|إنستجرام|instagram)\s+(?:عن|ل)\s+(.+)/i,
    /محتوى\s+سوشيال\s+(?:عن|ل)\s+(.+)/i,
    /social\s+(?:media\s+)?(?:post|content)\s+(?:about|on|for)\s+(.+)/i,
  ];

  for (const pattern of socialPatterns) {
    const match = message.match(pattern);
    if (match) {
      const topic = match[1].trim();
      const result = await runMediaTool('media-social', topic);
      if (result.success) {
        return { matched: true, tool: 'media-social', input: topic, result: `📱 **محتوى سوشيال: ${topic}**\n\n${result.output}` };
      }
      return { matched: true, tool: 'media-social', input: topic, error: result.error };
    }
  }

  // ═══════════════════════════════════════════
  // 12. Book Writer — كتاب كتب
  // ═══════════════════════════════════════════
  const bookPatterns = [
    /(?:اكتب|اعمل)\s+(?:لي\s+)?(?:كتاب|قصة|رواية)\s+(?:عن|في)\s+(.+)/i,
    /write\s+(?:me\s+)?(?:a\s+)?(?:book|story|novel)\s+(?:about|on)\s+(.+)/i,
  ];

  for (const pattern of bookPatterns) {
    const match = message.match(pattern);
    if (match) {
      const topic = match[1].trim();
      const result = await runAgentTool('agent-book-writer', topic);
      if (result.success) {
        return { matched: true, tool: 'agent-book-writer', input: topic, result: `📚 **كتاب عن: ${topic}**\n\n${result.output}` };
      }
    }
  }

  // ═══════════════════════════════════════════
  // 13. News — أخبار
  // ═══════════════════════════════════════════
  const newsPatterns = [
    /(?:اكتب|اعمل)\s+(?:لي\s+)?(?:خبر|تقرير\s+إخباري)\s+(?:عن|ل)\s+(.+)/i,
    /write\s+(?:a\s+)?(?:news\s+)?article\s+(?:about|on)\s+(.+)/i,
  ];

  for (const pattern of newsPatterns) {
    const match = message.match(pattern);
    if (match) {
      const topic = match[1].trim();
      const result = await runAgentTool('agent-news', topic);
      if (result.success) {
        return { matched: true, tool: 'agent-news', input: topic, result: `📰 **خبر عن: ${topic}**\n\n${result.output}` };
      }
    }
  }

  // ═══════════════════════════════════════════
  // 14. Financial — محلل مالي
  // ═══════════════════════════════════════════
  const financialPatterns = [
    /(?:حلل|اعمل\s+تحليل)\s+(?:مالي\s+)?(?:سهم|شركة|stock)\s+(.+)/i,
    /analyze\s+(?:stock|company)\s+(.+)/i,
    /حلل\s+(?:سهم|شركة)\s+(.+)/i,
  ];

  for (const pattern of financialPatterns) {
    const match = message.match(pattern);
    if (match) {
      const query = match[1].trim();
      const result = await runAgentTool('agent-financial', query);
      if (result.success) {
        return { matched: true, tool: 'agent-financial', input: query, result: `💰 **تحليل مالي: ${query}**\n\n${result.output}` };
      }
    }
  }

  // ═══════════════════════════════════════════
  // 15. Booking — حجز
  // ═══════════════════════════════════════════
  const bookingPatterns = [
    /(?:احجز|خطط|اعمل\s+خطة)\s+(?:لي\s+)?(?:رحلة|سفر|فندق|طيران)\s+(.+)/i,
    /(?:book|plan)\s+(?:a\s+)?(?:trip|flight|hotel)\s+(?:to|for|in)\s+(.+)/i,
    /سفر\s+(?:ل|الى|إلى)\s+(.+)/i,
  ];

  for (const pattern of bookingPatterns) {
    const match = message.match(pattern);
    if (match) {
      const query = match[1].trim();
      const result = await runAgentTool('agent-booking', query);
      if (result.success) {
        return { matched: true, tool: 'agent-booking', input: query, result: `✈️ **تخطيط رحلة: ${query}**\n\n${result.output}` };
      }
    }
  }

  // ═══════════════════════════════════════════
  // 16. Deep Research — بحث عميق
  // ═══════════════════════════════════════════
  const researchPatterns = [
    /(?:ابحث\s+بعمق|اعمل\s+بحث\s+عميق|دراسة\s+عميقة)\s+(?:عن|ل)\s+(.+)/i,
    /(?:deep\s+)?research\s+(?:about|on)\s+(.+)/i,
    /اعمل\s+تقرير\s+(?:عن|ل)\s+(.+)/i,
  ];

  for (const pattern of researchPatterns) {
    const match = message.match(pattern);
    if (match) {
      const topic = match[1].trim();
      const result = await runAgentTool('agent-research', topic);
      if (result.success) {
        return { matched: true, tool: 'agent-research', input: topic, result: `🔬 **بحث عميق: ${topic}**\n\n${result.output}` };
      }
    }
  }

  // ═══════════════════════════════════════════
  // 17. Paralegal — قانوني
  // ═══════════════════════════════════════════
  const legalPatterns = [
    /(?:استشارة|استشاره)\s+قانونية\s+(.+)/i,
    /(?:مساعدة|مساعده)\s+قانونية\s+(.+)/i,
    /legal\s+(?:advice|help)\s+(?:about|on)\s+(.+)/i,
    /محامي\s+(.+)/i,
  ];

  for (const pattern of legalPatterns) {
    const match = message.match(pattern);
    if (match) {
      const query = match[1].trim();
      const result = await runAgentTool('agent-paralegal', query);
      if (result.success) {
        return { matched: true, tool: 'agent-paralegal', input: query, result: `⚖️ **استشارة قانونية: ${query}**\n\n${result.output}` };
      }
    }
  }

  // ═══════════════════════════════════════════
  // 18. Brand — مراقبة علامات
  // ═══════════════════════════════════════════
  const brandPatterns = [
    /(?:حلل|اعمل\s+تحليل)\s+(?:علامة|براند|brand)\s+(?:تجارية\s+)?(.+)/i,
    /brand\s+analysis\s+(?:for|of)\s+(.+)/i,
  ];

  for (const pattern of brandPatterns) {
    const match = message.match(pattern);
    if (match) {
      const brand = match[1].trim();
      const result = await runAgentTool('agent-brand', brand);
      if (result.success) {
        return { matched: true, tool: 'agent-brand', input: brand, result: `🏷️ **تحليل علامة: ${brand}**\n\n${result.output}` };
      }
    }
  }

  // ═══════════════════════════════════════════
  // 19. GitHub RAG — شات مع GitHub repo
  // ═══════════════════════════════════════════
  const githubRagPatterns = [
    /(?:حلل|اعرض|اعرف)\s+(?:مستودع|repo|repository)\s+(https?:\/\/github\.com\/[^\s]+)/i,
    /(?:شات\s+مع|chat\s+with)\s+(?:github|repo)\s+(https?:\/\/github\.com\/[^\s]+)/i,
  ];

  for (const pattern of githubRagPatterns) {
    const match = message.match(pattern);
    if (match) {
      const url = match[1];
      const question = message.replace(match[0], '').trim() || 'اعرض ملخص عن المشروع';
      const result = await runRAGTool('rag-github', `${url} ${question}`);
      if (result.success) {
        return { matched: true, tool: 'rag-github', input: url, result: result.output };
      }
    }
  }

  // ═══════════════════════════════════════════
  // 20. Code Chat — شات مع كود
  // ═══════════════════════════════════════════
  if (message.includes('```') && (lower.includes('اشرح') || lower.includes('حلل') || lower.includes('explain') || lower.includes('analyze'))) {
    const result = await runRAGTool('rag-code-chat', message);
    if (result.success) {
      return { matched: true, tool: 'rag-code-chat', input: '(code)', result: result.output };
    }
  }

  // ═══════════════════════════════════════════
  // 21. Corrective RAG — بحث تصحيحي
  // ═══════════════════════════════════════════
  const correctivePatterns = [
    /(?:ابحث\s+بتحقق|search\s+with\s+verification|corrective\s+search)/i,
    /تحقق\s+من\s+(.+)/i,
  ];

  for (const pattern of correctivePatterns) {
    const match = message.match(pattern);
    if (match) {
      const query = match[1] || message;
      const result = await runRAGTool('rag-corrective', query);
      if (result.success) {
        return { matched: true, tool: 'rag-corrective', input: query, result: result.output };
      }
    }
  }

  // ═══════════════════════════════════════════
  // 22. Sales Analytics — تحليل مبيعات
  // ═══════════════════════════════════════════
  const salesPatterns = [
    /(?:حلل|اعمل\s+تحليل)\s+(?:بيانات\s+)?(?:المبيعات|sales|مبيعات)/i,
    /analyze\s+(?:sales|revenue)\s+data/i,
  ];
  for (const pattern of salesPatterns) {
    if (pattern.test(lower) && message.length > 50) {
      const result = await runBusinessTool('biz-sales', message);
      if (result.success) return { matched: true, tool: 'biz-sales', input: '(data)', result: result.output };
    }
  }

  // ═══════════════════════════════════════════
  // 23. Amazon Analysis — تحليل منتج
  // ═══════════════════════════════════════════
  const amazonPatterns = [
    /(?:حلل|اعرض)\s+(?:منتج\s+)?(?:amazon|أمازون)\s+(.+)/i,
    /analyze\s+amazon\s+(?:product\s+)?(.+)/i,
  ];
  for (const pattern of amazonPatterns) {
    const match = message.match(pattern);
    if (match) {
      const result = await runBusinessTool('biz-amazon', match[1].trim());
      if (result.success) return { matched: true, tool: 'biz-amazon', input: match[1].trim(), result: result.output };
    }
  }

  // ═══════════════════════════════════════════
  // 24. Portfolio — تحليل محفظة
  // ═══════════════════════════════════════════
  const portfolioPatterns = [
    /(?:حلل|اعمل\s+تحليل)\s+(?:محفظة|portfolio)/i,
    /portfolio\s+analysis/i,
  ];
  for (const pattern of portfolioPatterns) {
    if (pattern.test(lower)) {
      const result = await runBusinessTool('biz-portfolio', message);
      if (result.success) return { matched: true, tool: 'biz-portfolio', input: '(portfolio)', result: result.output };
    }
  }

  // ═══════════════════════════════════════════
  // 25. Website to API
  // ═══════════════════════════════════════════
  const apiPatterns = [
    /(?:حوّل|حول|convert)\s+(?:موقع|website|site)\s+(?:ل|to)\s+(?:api|API)/i,
    /website\s+to\s+api/i,
  ];
  for (const pattern of apiPatterns) {
    const urlMatch = message.match(/https?:\/\/[^\s]+/);
    if (pattern.test(lower) && urlMatch) {
      const result = await runBusinessTool('biz-website-api', urlMatch[0]);
      if (result.success) return { matched: true, tool: 'biz-website-api', input: urlMatch[0], result: result.output };
    }
  }

  // ═══════════════════════════════════════════
  // 26. Model Comparison — مقارنة نماذج
  // ═══════════════════════════════════════════
  const modelComparePatterns = [
    /(?:قارن|مقارنة)\s+(?:بين\s+)?(?:النماذج|models?|AI\s+models?)/i,
    /compare\s+models/i,
    /ايه\s+افضل\s+(?:نموذج|model)/i,
  ];
  for (const pattern of modelComparePatterns) {
    if (pattern.test(lower)) {
      const result = await runCompareTool('compare-models', message);
      if (result.success) return { matched: true, tool: 'compare-models', input: message, result: result.output };
    }
  }

  // ═══════════════════════════════════════════
  // 27. Code Evaluation — تقييم كود
  // ═══════════════════════════════════════════
  if (message.includes('```') && (lower.includes('قيّم') || lower.includes('قيم') || lower.includes('evaluate') || lower.includes('تقييم'))) {
    const result = await runCompareTool('compare-code', message);
    if (result.success) return { matched: true, tool: 'compare-code', input: '(code)', result: result.output };
  }

  // ═══════════════════════════════════════════
  // 28. Fine-tuning Guide — دليل fine-tuning
  // ═══════════════════════════════════════════
  const finetunePatterns = [
    /(?:ازاي|كيف|how\s+to)\s+(?:أعمل|اعمل|do)\s+(?:fine.?tun|ضبط\s+نموذج)/i,
    /fine.?tuning\s+guide/i,
    /دليل\s+(?:fine.?tuning|الضبط)/i,
  ];
  for (const pattern of finetunePatterns) {
    if (pattern.test(lower)) {
      const result = await runCompareTool('finetune-guide', message);
      if (result.success) return { matched: true, tool: 'finetune-guide', input: message, result: result.output };
    }
  }

  // ═══════════════════════════════════════════
  // 29. Meeting Notes — ملاحظات اجتماعات
  // ═══════════════════════════════════════════
  const meetingPatterns = [
    /(?:اعمل|اكتب|استخرج)\s+(?:ملاحظات|محضر)\s+(?:اجتماع|meeting)/i,
    /meeting\s+notes/i,
    /محضر\s+اجتماع/i,
  ];
  for (const pattern of meetingPatterns) {
    if (pattern.test(lower) && message.length > 100) {
      const result = await runAudioTool('audio-meeting-notes', message);
      if (result.success) return { matched: true, tool: 'audio-meeting-notes', input: '(meeting)', result: `📋 **ملاحظات الاجتماع**\n\n${result.output}` };
    }
  }

  // ═══════════════════════════════════════════
  // 30. Audio Analysis — تحليل صوتي
  // ═══════════════════════════════════════════
  const audioAnalysisPatterns = [
    /(?:حلل|اعمل\s+تحليل)\s+(?:صوتي|صوت|audio)/i,
    /audio\s+analysis/i,
    /تحليل\s+محتوى\s+صوتي/i,
  ];
  for (const pattern of audioAnalysisPatterns) {
    if (pattern.test(lower) && message.length > 100) {
      const result = await runAudioTool('audio-analysis', message);
      if (result.success) return { matched: true, tool: 'audio-analysis', input: '(audio)', result: `🎵 **تحليل صوتي**\n\n${result.output}` };
    }
  }

  // ═══════════════════════════════════════════
  // 31. Swarm Agents
  // ═══════════════════════════════════════════
  const swarmPatterns = [
    /(?:شغل|استخدم)\s+(?:swarm|سوARM|وكلاء\s+متضافرين)/i,
    /swarm\s+agents/i,
  ];
  for (const pattern of swarmPatterns) {
    if (pattern.test(lower)) {
      const result = await runAdvAgentTool('agent-swarm', message);
      if (result.success) return { matched: true, tool: 'agent-swarm', input: message, result: result.output };
    }
  }

  // ═══════════════════════════════════════════
  // 32. Agent Builder — بناء وكيل
  // ═══════════════════════════════════════════
  const buildAgentPatterns = [
    /(?:ابني|صمم|اعمل)\s+(?:لي\s+)?(?:وكيل|agent)\s+(?:AI|ذكي)?/i,
    /build\s+(?:me\s+)?(?:an?\s+)?agent/i,
    /design\s+(?:an?\s+)?agent/i,
  ];
  for (const pattern of buildAgentPatterns) {
    if (pattern.test(lower)) {
      const result = await runAdvAgentTool('agent-builder', message);
      if (result.success) return { matched: true, tool: 'agent-builder', input: message, result: result.output };
    }
  }

  // ═══════════════════════════════════════════
  // 33. ACP Protocol
  // ═══════════════════════════════════════════
  const acpPatterns = [
    /(?:acp|agent\s+communication\s+protocol)/i,
    /بروتوكول\s+(?:acp|اتصال\s+الوكلاء)/i,
  ];
  for (const pattern of acpPatterns) {
    if (pattern.test(lower)) {
      const result = await runAdvAgentTool('agent-acp', message.replace(pattern, '').trim() || 'AI impact');
      if (result.success) return { matched: true, tool: 'agent-acp', input: message, result: result.output };
    }
  }

  // ═══════════════════════════════════════════
  // 34. A2A Protocol
  // ═══════════════════════════════════════════
  const a2aPatterns = [
    /(?:a2a|agent2agent|agent\s+to\s+agent)/i,
    /وكلاء\s+يتواصلوا/i,
  ];
  for (const pattern of a2aPatterns) {
    if (pattern.test(lower)) {
      const result = await runAdvAgentTool('agent-a2a', message.replace(pattern, '').trim() || 'حلل AI');
      if (result.success) return { matched: true, tool: 'agent-a2a', input: message, result: result.output };
    }
  }

  // ═══════════════════════════════════════════
  // 35. Content Planner — مخطط محتوى متقدم
  // ═══════════════════════════════════════════
  const contentPlanPatterns = [
    /(?:خطط|اعمل\s+خطة)\s+(?:محتوى|content)\s+(?:كامل|شامل|أسبوع)/i,
    /content\s+(?:plan|planner)\s+(?:for|about)/i,
  ];
  for (const pattern of contentPlanPatterns) {
    if (pattern.test(lower)) {
      const topic = message.replace(pattern, '').trim() || 'الذكاء الاصطناعي';
      const result = await runAdvAgentTool('agent-content-planner', topic);
      if (result.success) return { matched: true, tool: 'agent-content-planner', input: topic, result: result.output };
    }
  }

  // ═══════════════════════════════════════════
  // 36. SQL Router
  // ═══════════════════════════════════════════
  const sqlRouterPatterns = [
    /(?:sql\s+router|راوتر\s+sql)/i,
    /(?:route|راوت)\s+(?:between|بين)\s+(?:doc|document|sql)/i,
  ];
  for (const pattern of sqlRouterPatterns) {
    if (pattern.test(lower)) {
      const result = await runAdvRAGTool('rag-sql-router', message);
      if (result.success) return { matched: true, tool: 'rag-sql-router', input: message, result: result.output };
    }
  }

  // ═══════════════════════════════════════════
  // 37. Context Engine
  // ═══════════════════════════════════════════
  const contextEnginePatterns = [
    /(?:context\s+engine|محرك\s+السياق)/i,
    /(?:بحث\s+متعدد\s+المصادر|multi-source\s+research)/i,
  ];
  for (const pattern of contextEnginePatterns) {
    if (pattern.test(lower)) {
      const topic = message.replace(pattern, '').trim() || 'AI';
      const result = await runAdvRAGTool('rag-context', topic);
      if (result.success) return { matched: true, tool: 'rag-context', input: topic, result: result.output };
    }
  }

  return { matched: false };
}

/**
 * كشف وتشغيل أدوات Vision (OCR/تحليل صور).
 * بتتبعت لما المستخدم يرفع صورة في الشات.
 */
export async function detectAndRunVision(
  message: string,
  imageBase64?: string
): Promise<MCPIntentResult> {
  if (!imageBase64) return { matched: false };

  const lower = message.toLowerCase().trim();

  // ═══════════════════════════════════════════
  // OCR — استخراج نص
  // ═══════════════════════════════════════════
  const ocrPatterns = [
    /(?:استخرج|اقرا|اقرأ)\s+(?:النص|الكي|الكلام)/i,
    /ocr/i,
    /استخرج\s+النص/i,
    /extract\s+(?:text|all\s+text)/i,
    /read\s+(?:the\s+)?text/i,
    /شنو\s+مكتوب/i,
    /ايه\s+المكتوب/i,
    /مكتوب\s+فيه\s+ايه/i,
  ];

  for (const pattern of ocrPatterns) {
    if (pattern.test(lower)) {
      const result = await runVisionTool('ocr-extract', imageBase64);
      if (result.success) {
        return {
          matched: true,
          tool: 'ocr-extract',
          result: `📝 **النص المستخرج:**\n\n${result.output}`,
        };
      }
      return { matched: true, tool: 'ocr-extract', error: result.error };
    }
  }

  // ═══════════════════════════════════════════
  // LaTeX — معادلات
  // ═══════════════════════════════════════════
  const latexPatterns = [
    /latex/i,
    /معادلة|معادله/i,
    /equation/i,
    /math/i,
    /رياض/i,
  ];

  for (const pattern of latexPatterns) {
    if (pattern.test(lower)) {
      const result = await runVisionTool('ocr-latex', imageBase64);
      if (result.success) {
        return {
          matched: true,
          tool: 'ocr-latex',
          result: `🔢 **LaTeX:**\n\n\`\`\`latex\n${result.output}\n\`\`\``,
        };
      }
    }
  }

  // ═══════════════════════════════════════════
  // Chart — رسم بياني
  // ═══════════════════════════════════════════
  const chartPatterns = [
    /رسم\s+بياني/i,
    /chart/i,
    /graph/i,
    /بيانات\s+الرسم/i,
  ];

  for (const pattern of chartPatterns) {
    if (pattern.test(lower)) {
      const result = await runVisionTool('chart-analyze', imageBase64);
      if (result.success) {
        return {
          matched: true,
          tool: 'chart-analyze',
          result: `📈 **تحليل الرسم البياني:**\n\n${result.output}`,
        };
      }
    }
  }

  // ═══════════════════════════════════════════
  // Structured — استخراج منظم
  // ═══════════════════════════════════════════
  const structuredPatterns = [
    /استخرج\s+(?:البيانات|المعلومات)/i,
    /json/i,
    /فاتورة|إيصال|receipt|invoice/i,
    /نموذج|form/i,
  ];

  for (const pattern of structuredPatterns) {
    if (pattern.test(lower)) {
      const result = await runVisionTool('ocr-structured', imageBase64);
      if (result.success) {
        return {
          matched: true,
          tool: 'ocr-structured',
          result: `📊 **البيانات المستخرجة:**\n\n\`\`\`json\n${result.output}\n\`\`\``,
        };
      }
    }
  }

  // ═══════════════════════════════════════════
  // Vision Analyze — تحليل عام (default لو فيه صورة وسؤال)
  // ═══════════════════════════════════════════
  // لو فيه صورة + أي سؤال → حللها
  const result = await runVisionTool('vision-analyze', imageBase64, message);
  if (result.success) {
    return {
      matched: true,
      tool: 'vision-analyze',
      result: `👁️ **تحليل الصورة:**\n\n${result.output}`,
    };
  }

  return { matched: false };
}
