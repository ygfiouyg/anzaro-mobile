import { NextRequest, NextResponse } from 'next/server';
import { getZAIClient } from '@/lib/chat-utils';
import { extractBearerToken, getUserFromToken } from '@/lib/auth';
import { checkRateLimit, RATE_LIMIT_PRESETS } from '@/lib/rate-limit';
import { resolveActiveModel } from "@/lib/active-model";


// ─── Types ────────────────────────────────────────────────────────────
interface MindMapNode {
  id: string;
  text: string;
  children: MindMapNode[];
  color?: string;
}

interface MindMapRequest {
  topic: string;
  content?: string;
  depth?: number;
  model?: string;
  demo?: boolean;
  expandNodeId?: string;  // For expanding a specific node
  expandNodeText?: string; // Text of the node to expand
  expandContext?: string;  // Context (parent topic)
  expandContent?: string;  // Original uploaded content to stick to
  language?: string;       // 'ar' or 'en'
}

// ─── Color palette for branches ───────────────────────────────────────
const BRANCH_COLORS = [
  '#10b981', '#14b8a6', '#f59e0b', '#06b6d4',
  '#8b5cf6', '#ec4899', '#ef4444', '#22c55e',
  '#f97316', '#6366f1', '#0ea5e9', '#a855f7',
];

function assignColors(node: MindMapNode, depth: number = 0, colorIndex: number = 0): MindMapNode {
  const colored: MindMapNode = {
    ...node,
    color: depth === 0 ? '#10b981' : BRANCH_COLORS[colorIndex % BRANCH_COLORS.length],
  };
  if (colored.children && colored.children.length > 0) {
    colored.children = colored.children.map((child, idx) =>
      assignColors(child, depth + 1, depth === 0 ? idx : colorIndex)
    );
  }
  return colored;
}

// ─── Language Detection ───────────────────────────────────────────────
function detectLanguage(text: string): 'ar' | 'en' {
  const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g;
  const arabicMatches = text.match(arabicRegex);
  const arabicCount = arabicMatches ? arabicMatches.length : 0;
  const latinCount = (text.match(/[a-zA-Z]/g) || []).length;
  return arabicCount > latinCount ? 'ar' : 'en';
}

// ─── JSON extraction utility ──────────────────────────────────────────
function extractJSON(text: string): string {
  let cleaned = text.replace(/```(?:json)?\s*/gi, '').replace(/```\s*/g, '').trim();
  try { JSON.parse(cleaned); return cleaned; } catch {}

  let depth = 0;
  let start = -1;
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escapeNext) { escapeNext = false; continue; }
    if (ch === '\\' && inString) { escapeNext = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') { if (depth === 0) start = i; depth++; }
    else if (ch === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        const candidate = cleaned.substring(start, i + 1);
        try { JSON.parse(candidate); return candidate; } catch { start = -1; }
      }
    }
  }

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return cleaned.substring(firstBrace, lastBrace + 1);
  }
  return cleaned;
}

// ─── Find mindmap in various JSON structures ──────────────────────────
function findMindmapInResponse(parsed: Record<string, unknown>): MindMapNode | null {
  if (parsed.mindmap && typeof parsed.mindmap === 'object') return parsed.mindmap as MindMapNode;
  if (parsed.data && typeof parsed.data === 'object') {
    const inner = parsed.data as Record<string, unknown>;
    if (inner.mindmap) return inner.mindmap as MindMapNode;
  }
  if (parsed.id && parsed.text && typeof parsed.text === 'string') return parsed as unknown as MindMapNode;
  if (parsed.root && typeof parsed.root === 'object') return parsed.root as MindMapNode;
  if (Array.isArray(parsed.nodes) && parsed.nodes.length > 0) return parsed.nodes[0] as MindMapNode;
  for (const value of Object.values(parsed)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const obj = value as Record<string, unknown>;
      if (obj.text && (obj.children || obj.id)) return obj as unknown as MindMapNode;
    }
  }
  return null;
}

// ─── Generate a fallback mind map from topic ──────────────────────────
function generateFallbackMindMap(topic: string, lang: 'ar' | 'en'): MindMapNode {
  const branches = lang === 'ar'
    ? [
        { id: 'b1', text: 'المفهوم والتعريف', children: [{ id: 'b1-1', text: 'التعريف الأساسي', children: [] }, { id: 'b1-2', text: 'الأهمية', children: [] }] },
        { id: 'b2', text: 'الأنواع والأقسام', children: [{ id: 'b2-1', text: 'التصنيفات الرئيسية', children: [] }, { id: 'b2-2', text: 'الخصائص', children: [] }] },
        { id: 'b3', text: 'التطبيقات العملية', children: [{ id: 'b3-1', text: 'مجالات الاستخدام', children: [] }, { id: 'b3-2', text: 'الأمثلة', children: [] }] },
        { id: 'b4', text: 'المميزات والتحديات', children: [{ id: 'b4-1', text: 'الإيجابيات', children: [] }, { id: 'b4-2', text: 'الصعوبات', children: [] }] },
      ]
    : [
        { id: 'b1', text: 'Concept & Definition', children: [{ id: 'b1-1', text: 'Core Definition', children: [] }, { id: 'b1-2', text: 'Importance', children: [] }] },
        { id: 'b2', text: 'Types & Categories', children: [{ id: 'b2-1', text: 'Main Classifications', children: [] }, { id: 'b2-2', text: 'Characteristics', children: [] }] },
        { id: 'b3', text: 'Practical Applications', children: [{ id: 'b3-1', text: 'Use Cases', children: [] }, { id: 'b3-2', text: 'Examples', children: [] }] },
        { id: 'b4', text: 'Advantages & Challenges', children: [{ id: 'b4-1', text: 'Benefits', children: [] }, { id: 'b4-2', text: 'Difficulties', children: [] }] },
      ];

  return { id: 'root', text: topic, children: branches };
}

// ─── POST Handler ─────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    // ── FIX: Add auth + rate limiting to mindmap endpoint ──
    const authHeader = request.headers.get('Authorization');
    const token = extractBearerToken(authHeader);
    const user = await getUserFromToken(token);

    const rateLimitResponse = checkRateLimit(
      request,
      user ? RATE_LIMIT_PRESETS.ai : { ...RATE_LIMIT_PRESETS.ai, maxRequests: 3 },
      user?.id
    );
    if (rateLimitResponse) return rateLimitResponse;

    const body: MindMapRequest = await request.json();
    const { topic, content, demo, expandNodeId, expandNodeText, expandContext, expandContent, language } = body;

    if (!topic && !expandNodeId) {
      return NextResponse.json({ error: 'يرجى إدخال الموضوع' }, { status: 400 });
    }

    // ─── Demo mode: return pre-built mind map instantly ──────────────
    if (demo) {
      const demoMap: MindMapNode = {
        id: 'root', text: 'الذكاء الاصطناعي',
        children: [
          { id: 'b1', text: 'تعلم الآلة', children: [{ id: 'b1-1', text: 'التعلم العميق', children: [] }, { id: 'b1-2', text: 'الشبكات العصبية', children: [] }, { id: 'b1-3', text: 'التعلم المعزز', children: [] }] },
          { id: 'b2', text: 'معالجة اللغة', children: [{ id: 'b2-1', text: 'الترجمة الآلية', children: [] }, { id: 'b2-2', text: 'تحليل المشاعر', children: [] }, { id: 'b2-3', text: 'الرد الآلي', children: [] }] },
          { id: 'b3', text: 'الرؤية الحاسوبية', children: [{ id: 'b3-1', text: 'التعرف على الصور', children: [] }, { id: 'b3-2', text: 'كشف الأجسام', children: [] }] },
          { id: 'b4', text: 'التطبيقات', children: [{ id: 'b4-1', text: 'الطب والتشخيص', children: [] }, { id: 'b4-2', text: 'السيارات ذاتية القيادة', children: [] }, { id: 'b4-3', text: 'الروبوتات', children: [] }] },
          { id: 'b5', text: 'التحديات', children: [{ id: 'b5-1', text: 'الأخلاقيات', children: [] }, { id: 'b5-2', text: 'الخصوصية', children: [] }] },
        ],
      };
      const coloredMap = assignColors(demoMap);
      return NextResponse.json({ mindmap: coloredMap, summary: 'خريطة ذهنية توضيحية عن الذكاء الاصطناعي وفروعه المختلفة', language: 'ar' });
    }

    // ─── Expand Node: AI generates sub-nodes for a clicked node ──────
    if (expandNodeId && expandNodeText) {
      return await handleExpandNode(
        expandNodeId,
        expandNodeText,
        expandContext || '',
        (language || 'ar') as 'ar' | 'en',
        expandContent || ''  // Pass original content to stick to
      );
    }

    // ─── Auto-detect language ────────────────────────────────────────
    const fullText = `${topic} ${content || ''}`;
    const lang = (language || detectLanguage(fullText)) as 'ar' | 'en';

    // ─── Auto-determine depth based on content length ────────────────
    const contentLen = (content || topic).length;
    let autoDepth = 2;
    if (contentLen > 2000) autoDepth = 3;
    else if (contentLen < 200) autoDepth = 1;

    const isAr = lang === 'ar';
    const hasContent = content && content.trim().length > 50;

    // Build prompt - STRICTLY stick to provided content when available
    let systemPrompt: string;
    let userPrompt: string;

    if (hasContent) {
      // When content is provided (lectures, notes, etc.), STRICTLY use ONLY that content
      systemPrompt = isAr
        ? `JSON فقط. خريطة ذهنية من المحتوى المرفق فقط. 
⚠️ قاعدة صارمة: استخدم فقط المعلومات الموجودة في المحتوى المرفق. لا تضف أي معلومات من الخارج. لا تخترع تفاصيل غير موجودة.
- عدد الفروع يتحدد تلقائياً حسب المحتوى (ليس له حد)
- العمق تلقائي (${autoDepth === 1 ? 'مستوى واحد' : autoDepth === 2 ? 'مستويين' : '3 مستويات'})
- كل فرع يكون له عدد فرعية حسب ما يوجد في المحتوى فعلاً
- إذا كان المحتوى غني، ضع فروع أكثر. إذا كان محدود، ضع أقل.
{"mindmap":{"id":"root","text":"الموضوع","children":[{"id":"b1","text":"فرع","children":[]}]},"summary":"ملخص من المحتوى فقط"}
كل عقدة=id+text+children. نصوص قصيرة بالعربية فقط.`
        : `JSON only. Mind map from the attached content ONLY.
⚠️ STRICT RULE: Use ONLY the information in the attached content. Do NOT add any external knowledge. Do NOT invent details not present.
- Number of branches is automatic based on content (no limit)
- Depth is automatic (${autoDepth} level${autoDepth > 1 ? 's' : ''})
- Each branch gets sub-branches based on what actually exists in the content
- If content is rich, add more branches. If limited, add fewer.
{"mindmap":{"id":"root","text":"Topic","children":[{"id":"b1","text":"Branch","children":[]}]},"summary":"Summary from content only"}
Each node=id+text+children. Short texts in English only.`;

      userPrompt = `${topic}\n\nالمحتوى:\n${content!.slice(0, 3000)}`;
    } else {
      // No content provided - general knowledge mode
      systemPrompt = isAr
        ? `JSON فقط. خريطة ذهنية عن الموضوع. عمق تلقائي (${autoDepth === 1 ? 'مستوى واحد' : autoDepth === 2 ? 'مستويين' : '3 مستويات'}). عدد الفروع تلقائي حسب أهمية الموضوع (4-10 فروع). لكل فرع عدد فرعية حسب أهميته (2-6 فرعية).
{"mindmap":{"id":"root","text":"الموضوع","children":[{"id":"b1","text":"فرع","children":[]}]},"summary":"ملخص"}
كل عقدة=id+text+children. نصوص قصيرة بالعربية فقط. أضف تفاصيل كافية حسب أهمية كل فرع.`
        : `JSON only. Mind map about the topic. Auto depth (${autoDepth} level${autoDepth > 1 ? 's' : ''}). Auto number of branches based on topic importance (4-10 branches). Each branch gets sub-branches based on its importance (2-6 sub-branches).
{"mindmap":{"id":"root","text":"Topic","children":[{"id":"b1","text":"Branch","children":[]}]},"summary":"Summary"}
Each node=id+text+children. Short texts in English only. Add sufficient detail based on branch importance.`;

      userPrompt = topic;
    }

    let parsed: { mindmap?: MindMapNode; summary?: string } | null = null;
    let usedFallback = false;

    // ─── Single attempt with Promise.race timeout (20s max) ──────────
    try {
      const zai = await getZAIClient();
      console.log(`[MindMap] Generating: ${autoDepth} depth, lang=${lang}, ${contentLen} chars, hasContent=${hasContent}`);

      const TIMEOUT_MS = 20_000;
      // Use more tokens when content is provided
      const maxTokens = hasContent ? 3072 : 2048;
      const apiPromise = zai.chat.completions.create({
        model: (body.model || 'glm-4-flash'),
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: maxTokens,
      });

      const timeoutPromise = new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), TIMEOUT_MS)
      );

      const response = await Promise.race([apiPromise, timeoutPromise]);

      if (response) {
        const rawContent = response.choices?.[0]?.message?.content || '';
        if (rawContent) {
          console.log(`[MindMap] Response: ${rawContent.length} chars`);
          const jsonStr = extractJSON(rawContent);
          const jsonParsed = JSON.parse(jsonStr);
          const mindmap = findMindmapInResponse(jsonParsed as Record<string, unknown>);
          if (mindmap) {
            parsed = {
              mindmap,
              summary: (jsonParsed as Record<string, unknown>).summary
                ? String((jsonParsed as Record<string, unknown>).summary)
                : undefined,
            };
          }
        }
      } else {
        console.log('[MindMap] API timed out, using fallback');
      }
    } catch (err) {
      console.error('[MindMap] ZhipuAI error:', err instanceof Error ? err.message : String(err));
    }

    // ─── Fallback: generate basic mind map from topic ─────────────────
    if (!parsed?.mindmap) {
      usedFallback = true;
      parsed = {
        mindmap: generateFallbackMindMap(topic.trim(), lang),
        summary: lang === 'ar' ? `خريطة ذهنية أساسية عن: ${topic.trim()}` : `Basic mind map about: ${topic.trim()}`,
      };
    }

    // Normalize - remove the .slice(0, 8) limit to allow dynamic node count
    const normalizeNode = (node: Record<string, unknown>, prefix: string = 'n'): MindMapNode => {
      const children = Array.isArray(node.children) ? node.children : [];
      return {
        id: String(node.id || prefix),
        text: String(node.text || ''),
        children: children.map((child: Record<string, unknown>, idx: number) =>
          normalizeNode(child, `${prefix}-${idx}`)
        ),
      };
    };

    const mindmap = normalizeNode(parsed.mindmap as unknown as Record<string, unknown>);
    const coloredMindmap = assignColors(mindmap);
    const summary = String(parsed.summary || (isAr ? `خريطة ذهنية عن: ${topic}` : `Mind map about: ${topic}`));

    console.log(`[MindMap] Success! ${usedFallback ? '(fallback)' : '(AI)'} lang=${lang}, nodes=${countAllNodes(coloredMindmap)}`);

    return NextResponse.json({
      mindmap: coloredMindmap,
      summary,
      isFallback: usedFallback,
      language: lang,
      depth: autoDepth,
      hasContentSource: hasContent,  // True when generated from uploaded content
    });
  } catch (error) {
    console.error('[MindMap] Error:', error);
    return NextResponse.json(
      { error: 'حدث خطأ أثناء توليد الخريطة الذهنية. يرجى المحاولة مرة أخرى.' },
      { status: 500 }
    );
  }
}

// ─── Count all nodes ──────────────────────────────────────────────────
function countAllNodes(node: MindMapNode): number {
  let count = 1;
  if (node.children) {
    for (const child of node.children) {
      count += countAllNodes(child);
    }
  }
  return count;
}

// ─── Expand Node Handler ─────────────────────────────────────────────
async function handleExpandNode(
  nodeId: string,
  nodeText: string,
  context: string,
  language: 'ar' | 'en',
  originalContent: string = ''  // Original uploaded content to stick to
): Promise<NextResponse> {
  try {
    const isAr = language === 'ar';
    const hasContent = originalContent && originalContent.trim().length > 30;

    let systemPrompt: string;
    let userPrompt: string;

    if (hasContent) {
      // When original content exists, ONLY expand from that content
      systemPrompt = isAr
        ? `JSON فقط. أنشئ فروع فرعية مفصلة للعقدة التالية من المحتوى المرفق فقط.
⚠️ قاعدة صارمة: استخدم فقط المعلومات الموجودة في المحتوى المرفق. لا تضف أي معلومات من الخارج. لا تخترع تفاصيل غير موجودة.
- عدد الفروع الفرعية تلقائي حسب ما يوجد في المحتوى فعلاً (ليس له حد)
{"children":[{"id":"sub1","text":"فرع فرعي","children":[]}]}
كل عقدة=id+text+children. نصوص قصيرة بالعربية فقط.`
        : `JSON only. Create detailed sub-branches for the following mind map node from the attached content ONLY.
⚠️ STRICT RULE: Use ONLY the information in the attached content. Do NOT add any external knowledge. Do NOT invent details not present.
- Number of sub-branches is automatic based on what exists in the content (no limit)
{"children":[{"id":"sub1","text":"Sub-branch","children":[]}]}
Each node=id+text+children. Short texts in English only.`;

      userPrompt = isAr
        ? `العقدة: "${nodeText}"\nالسياق: ${context || 'خريطة ذهنية عامة'}\n\nالمحتوى الأصلي:\n${originalContent.slice(0, 2000)}`
        : `Node: "${nodeText}"\nContext: ${context || 'General mind map'}\n\nOriginal content:\n${originalContent.slice(0, 2000)}`;
    } else {
      // No content - general expansion mode
      systemPrompt = isAr
        ? `JSON فقط. أنشئ فروع فرعية مفصلة للعقدة التالية في خريطة ذهنية. عدد الفروع تلقائي حسب أهمية العقدة (2-6 فروع).
{"children":[{"id":"sub1","text":"فرع فرعي","children":[]}]}
كل عقدة=id+text+children. نصوص قصيرة بالعربية فقط.`
        : `JSON only. Create detailed sub-branches for the following mind map node. Auto number of sub-branches based on node importance (2-6 branches).
{"children":[{"id":"sub1","text":"Sub-branch","children":[]}]}
Each node=id+text+children. Short texts in English only.`;

      userPrompt = isAr
        ? `العقدة: "${nodeText}"\nالسياق: ${context || 'خريطة ذهنية عامة'}`
        : `Node: "${nodeText}"\nContext: ${context || 'General mind map'}`;
    }

    const zai = await getZAIClient();

    const TIMEOUT_MS = 15_000;
    const maxTokens = hasContent ? 1024 : 512;
    const apiPromise = zai.chat.completions.create({
      model: (body.model || 'glm-4-flash'),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: maxTokens,
    });

    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), TIMEOUT_MS)
    );

    const response = await Promise.race([apiPromise, timeoutPromise]);

    if (!response) {
      // Fallback: generate generic sub-branches
      const fallbackChildren: MindMapNode[] = isAr
        ? [
            { id: `${nodeId}-s1`, text: `${nodeText} - جانب 1`, children: [] },
            { id: `${nodeId}-s2`, text: `${nodeText} - جانب 2`, children: [] },
            { id: `${nodeId}-s3`, text: `${nodeText} - جانب 3`, children: [] },
          ]
        : [
            { id: `${nodeId}-s1`, text: `${nodeText} - Aspect 1`, children: [] },
            { id: `${nodeId}-s2`, text: `${nodeText} - Aspect 2`, children: [] },
            { id: `${nodeId}-s3`, text: `${nodeText} - Aspect 3`, children: [] },
          ];

      const coloredFallback = fallbackChildren.map((c, i) => assignColors(c, 1, i));
      return NextResponse.json({ children: coloredFallback, isFallback: true });
    }

    const rawContent = response.choices?.[0]?.message?.content || '';
    if (!rawContent) {
      return NextResponse.json({ children: [], isFallback: true });
    }

    const jsonStr = extractJSON(rawContent);
    const jsonParsed = JSON.parse(jsonStr);

    let children: MindMapNode[] = [];
    if (Array.isArray(jsonParsed.children)) {
      // Remove the .slice(0, 6) limit - allow dynamic number of children
      children = jsonParsed.children.map((child: Record<string, unknown>, idx: number) => ({
        id: String(child.id || `${nodeId}-s${idx}`),
        text: String(child.text || ''),
        children: Array.isArray(child.children) ? child.children.map((sc: Record<string, unknown>, sIdx: number) => ({
          id: String(sc.id || `${nodeId}-s${idx}-ss${sIdx}`),
          text: String(sc.text || ''),
          children: [],
        })) : [],
      }));
    } else if (Array.isArray(jsonParsed)) {
      children = jsonParsed.map((child: Record<string, unknown>, idx: number) => ({
        id: String(child.id || `${nodeId}-s${idx}`),
        text: String(child.text || ''),
        children: [],
      }));
    }

    // Assign colors
    children = children.map((c: MindMapNode, i: number) => assignColors(c, 1, i));

    console.log(`[MindMap] Expanded node "${nodeText}": ${children.length} children, hasContent=${hasContent}`);

    return NextResponse.json({ children, isFallback: false });
  } catch (error) {
    console.error('[MindMap] Expand error:', error);
    return NextResponse.json({ children: [], isFallback: true });
  }
}
