// ─── Smart Memory System for DeltaAI ──────────────────────────────────
// Learns user preferences, writing style, interests, and language
// across conversations using LLM extraction + heuristic fallback.

import { db } from '@/lib/db';
import { getZAIClient } from '@/lib/chat-utils';

// ─── Types ────────────────────────────────────────────────────────────
interface ExtractedMemory {
  category: 'style' | 'interest' | 'language' | 'preference';
  key: string;
  value: string;
}

// ─── Category Labels (Arabic) ─────────────────────────────────────────
export const CATEGORY_LABELS: Record<string, string> = {
  style: 'أسلوب الكتابة',
  interest: 'الاهتمامات',
  language: 'اللغة',
  preference: 'التفضيلات',
};

// ─── Heuristic Fallback ───────────────────────────────────────────────
// When LLM extraction times out or fails, use simple heuristics
function extractMemoriesHeuristic(userMessage: string): ExtractedMemory[] {
  const memories: ExtractedMemory[] = [];
  const msg = userMessage.trim();

  // Detect Arabic vs English
  const arabicChars = (msg.match(/[\u0600-\u06FF]/g) || []).length;
  const latinChars = (msg.match(/[a-zA-Z]/g) || []).length;
  const totalChars = arabicChars + latinChars;

  if (totalChars > 5) {
    const arabicRatio = arabicChars / totalChars;
    if (arabicRatio > 0.6) {
      // Detect Egyptian dialect
      const egyptianMarkers = ['عايز', 'عايزة', 'إيه', 'ليه', 'إزاي', 'مش', 'ده', 'دي', 'بتاع', 'قوي', 'أوي', 'يا باشا'];
      const isEgyptian = egyptianMarkers.some(m => msg.includes(m));
      memories.push({
        category: 'language',
        key: 'primary_language',
        value: isEgyptian ? 'عربي مصري' : 'عربي فصحى',
      });
    } else if (arabicRatio < 0.3) {
      memories.push({
        category: 'language',
        key: 'primary_language',
        value: 'English',
      });
    } else {
      memories.push({
        category: 'language',
        key: 'primary_language',
        value: 'مختلط عربي-إنجليزي',
      });
    }
  }

  // Detect topic keywords → interests
  const topicMap: Record<string, string> = {
    'برمج': 'البرمجة والتطوير',
    'كود': 'البرمجة والتطوير',
    'code': 'البرمجة والتطوير',
    'programming': 'البرمجة والتطوير',
    'python': 'البرمجة والتطوير',
    'javascript': 'البرمجة والتطوير',
    'هندس': 'الهندسة',
    'engineering': 'الهندسة',
    'ذكاء اصطناعي': 'الذكاء الاصطناعي',
    'ai': 'الذكاء الاصطناعي',
    'machine learning': 'الذكاء الاصطناعي',
    'تعلم آلي': 'الذكاء الاصطناعي',
    'طب': 'الطب والصحة',
    'medical': 'الطب والصحة',
    'صح': 'الطب والصحة',
    'تصميم': 'التصميم',
    'design': 'التصميم',
    'رياض': 'الرياضيات',
    'math': 'الرياضيات',
    'فيزي': 'الفيزياء',
    'physics': 'الفيزياء',
    'إسلام': 'الإسلام والدين',
    'قرآن': 'الإسلام والدين',
    'حديث': 'الإسلام والدين',
    'أعمال': 'الأعمال والريادة',
    'business': 'الأعمال والريادة',
    'startup': 'الأعمال والريادة',
  };

  const lowerMsg = msg.toLowerCase();
  for (const [keyword, topic] of Object.entries(topicMap)) {
    if (lowerMsg.includes(keyword)) {
      memories.push({
        category: 'interest',
        key: `topic_${topic.replace(/\s/g, '_')}`,
        value: topic,
      });
      break; // Only one topic per message
    }
  }

  // Detect format preferences
  if (msg.includes('نقاط') || msg.includes('bullet') || msg.includes('list')) {
    memories.push({ category: 'preference', key: 'format_preference', value: 'نقاط' });
  }
  if (msg.includes('جدول') || msg.includes('table')) {
    memories.push({ category: 'preference', key: 'format_preference', value: 'جداول' });
  }

  // Detect writing style
  if (msg.length < 30 && !msg.includes('.') && !msg.includes('،')) {
    memories.push({ category: 'style', key: 'writing_style', value: 'مختصر' });
  } else if (msg.length > 100) {
    memories.push({ category: 'style', key: 'writing_style', value: 'تفصيلي' });
  }

  return memories;
}

// ─── LLM-Based Memory Extraction ──────────────────────────────────────
async function extractMemoriesLLM(
  userMessage: string,
  assistantResponse: string
): Promise<ExtractedMemory[]> {
  try {
    const zai = await getZAIClient();

    const extractionPrompt = `أنت محلل ذكي لملف المستخدم. حلل المحادثة التالية واستخرج معلومات عن المستخدم.

أعد النتيجة كـ JSON فقط (بدون markdown أو شرح):
{
  "memories": [
    {"category": "style", "key": "writing_style", "value": "casual/formal/short/detailed"},
    {"category": "interest", "key": "topic_X", "value": "الموضوع"},
    {"category": "language", "key": "primary_language", "value": "عربي/إنجليزي/مختلط"},
    {"category": "language", "key": "dialect", "value": "مصري/سعودي/فصحى"},
    {"category": "preference", "key": "format_preference", "value": "نقاط/جداول/أكواد"}
  ]
}

القواعد:
- category يجب أن تكون واحدًا من: style, interest, language, preference
- key يجب أن يكون بالإنجليزية snake_case
- value يجب أن يكون بالعربي (ما عدا أسماء اللغات)
- value أقصى طول 200 حرف
- استخرج فقط ما أنت متأكد منه بنسبة 70%+
- أقصى 5 ذكريات لكل محادثة`;

    const timeoutPromise = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), 5000); // 5s timeout (was 3s — too aggressive for cold starts)
    });

    const llmPromise = zai.chat.completions.create({
      model: 'glm-4-flash',
      messages: [
        { role: 'system', content: extractionPrompt },
        {
          role: 'user',
          content: `رسالة المستخدم: ${userMessage.slice(0, 500)}\n\nرد المساعد: ${assistantResponse.slice(0, 300)}`,
        },
      ],
      temperature: 0,
      max_tokens: 300,
    }).catch(async (err: unknown) => {
      // If ZAI fails, try Pollinations as fallback for memory extraction
      console.warn('[UserMemory] ZAI failed, trying Pollinations:', err instanceof Error ? err.message : String(err));
      try {
        const { streamChatCompletion } = await import('@/lib/pollinations');
        const chunks: string[] = [];
        for await (const chunk of await streamChatCompletion({
          messages: [
            { role: 'system', content: extractionPrompt },
            {
              role: 'user',
              content: `رسالة المستخدم: ${userMessage.slice(0, 500)}\n\nرد المساعد: ${assistantResponse.slice(0, 300)}`,
            },
          ],
          model: 'openai',
          temperature: 0,
          max_tokens: 300,
        })) {
          const content = chunk.choices?.[0]?.delta?.content || '';
          if (content) chunks.push(content);
        }
        return {
          choices: [{ message: { content: chunks.join('') } }],
        } as any;
      } catch (pollErr) {
        console.warn('[UserMemory] Pollinations also failed:', pollErr instanceof Error ? pollErr.message : String(pollErr));
        return null as any;
      }
    });

    const result = await Promise.race([llmPromise, timeoutPromise]);

    if (!result) {
      console.log('[UserMemory] LLM extraction timed out, using heuristic fallback');
      return extractMemoriesHeuristic(userMessage);
    }

    let responseText = '';
    if (result.choices && result.choices.length > 0) {
      responseText = (result.choices[0].message?.content || '').trim();
    }

    // Strip markdown code fences if present
    responseText = responseText
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const parsed = JSON.parse(responseText);
    if (parsed.memories && Array.isArray(parsed.memories)) {
      return parsed.memories.slice(0, 5).map((m: Record<string, string>) => ({
        category: ['style', 'interest', 'language', 'preference'].includes(m.category)
          ? m.category
          : 'preference',
        key: String(m.key).slice(0, 50),
        value: String(m.value).slice(0, 200),
      }));
    }

    return [];
  } catch (error) {
    console.warn('[UserMemory] LLM extraction error, using heuristic fallback:', error instanceof Error ? error.message : String(error));
    return extractMemoriesHeuristic(userMessage);
  }
}

// ─── Public API ───────────────────────────────────────────────────────

/**
 * Extract memories from a conversation exchange and persist them.
 * ASYNC and NON-BLOCKING — call this with fire-and-forget after response.
 */
export async function extractMemories(
  userId: string,
  userMessage: string,
  assistantResponse: string
): Promise<void> {
  try {
    if (!userId || !userMessage || userMessage.length < 3) return;

    const extracted = await extractMemoriesLLM(userMessage, assistantResponse);

    for (const memory of extracted) {
      await updateMemory(userId, memory.category, memory.key, memory.value);
    }

    if (extracted.length > 0) {
      console.log(`[UserMemory] Extracted ${extracted.length} memories for user ${userId.slice(0, 8)}...`);
    }
  } catch (error) {
    // Never let memory extraction break anything
    console.warn('[UserMemory] extractMemories error (non-blocking):', error instanceof Error ? error.message : String(error));
  }
}

/**
 * Update a single memory: upsert with confidence adjustment.
 * If the same (userId, category, key) exists, increment sourceCount and adjust confidence.
 */
export async function updateMemory(
  userId: string,
  category: string,
  key: string,
  value: string
): Promise<void> {
  try {
    const existing = await db.userMemory.findUnique({
      where: { userId_category_key: { userId, category, key } },
    });

    if (existing) {
      // Same value observed again → increase confidence
      if (existing.value === value) {
        const newConfidence = Math.min(1.0, existing.confidence + 0.1);
        const newSourceCount = existing.sourceCount + 1;
        await db.userMemory.update({
          where: { id: existing.id },
          data: {
            confidence: newConfidence,
            sourceCount: newSourceCount,
          },
        });
      } else {
        // Different value → update with slightly lower confidence
        const newConfidence = Math.min(1.0, 0.5 + existing.sourceCount * 0.05);
        await db.userMemory.update({
          where: { id: existing.id },
          data: {
            value: value.slice(0, 200),
            confidence: newConfidence,
            sourceCount: existing.sourceCount + 1,
          },
        });
      }
    } else {
      // New memory
      await db.userMemory.create({
        data: {
          userId,
          category,
          key,
          value: value.slice(0, 200),
          confidence: 0.5,
          sourceCount: 1,
        },
      });
    }
  } catch (error) {
    console.warn('[UserMemory] updateMemory error:', error instanceof Error ? error.message : String(error));
  }
}

/**
 * Get all memories for a user.
 */
export async function getMemoriesForUser(userId: string) {
  try {
    return await db.userMemory.findMany({
      where: { userId },
      orderBy: [{ category: 'asc' }, { confidence: 'desc' }],
    });
  } catch {
    return [];
  }
}

/**
 * Get a formatted memory prompt to inject into the system prompt.
 * Returns an Arabic string summarizing user profile for the AI.
 */
export async function getMemoryPrompt(userId: string): Promise<string> {
  try {
    const memories = await getMemoriesForUser(userId);
    if (memories.length === 0) return '';

    // Group by category
    const grouped: Record<string, Array<{ key: string; value: string; confidence: number }>> = {};
    for (const m of memories) {
      if (!grouped[m.category]) grouped[m.category] = [];
      grouped[m.category].push({ key: m.key, value: m.value, confidence: m.confidence });
    }

    // Filter to only high-confidence memories (>= 0.3)
    const parts: string[] = [];
    for (const [category, items] of Object.entries(grouped)) {
      const filtered = items.filter(i => i.confidence >= 0.3);
      if (filtered.length === 0) continue;

      const label = CATEGORY_LABELS[category] || category;
      const values = filtered.map(i => i.value).join('، ');
      parts.push(`${label}: ${values}`);
    }

    if (parts.length === 0) return '';

    return `\n\n📋 ملف المستخدم: ${parts.join(' | ')}. خذ هذا في الاعتبار عند الرد ولكن لا تذكره صراحة.`;
  } catch {
    return '';
  }
}

/**
 * Delete a single memory by ID (must belong to the user).
 */
export async function deleteMemory(userId: string, memoryId: string): Promise<boolean> {
  try {
    const memory = await db.userMemory.findFirst({
      where: { id: memoryId, userId },
    });
    if (!memory) return false;

    await db.userMemory.delete({ where: { id: memoryId } });
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete all memories for a user.
 */
export async function clearAllMemories(userId: string): Promise<number> {
  try {
    const result = await db.userMemory.deleteMany({
      where: { userId },
    });
    return result.count;
  } catch {
    return 0;
  }
}
