/**
 * RAG & Document Tools — مستوحى من AI Engineering Hub
 * ====================================================
 * مصادر الكود:
 * - document-chat-rag: شات مع PDF
 * - agentic_rag: RAG وكيلي (PDF + web fallback)
 * - github-rag: شات مع GitHub repos
 * - chat-with-code: شات مع كود
 * - corrective-rag: RAG تصحيحي
 * - notebook-lm-clone: ملخص + استشهادات
 *
 * الربط الحقيقي:
 * - Pinecone vector DB للـ vector search الحقيقي
 * - Gemini text-embedding-004 للـ embeddings
 * - GLM-5.2 للـ synthesis
 */

import { getZAIClient } from '../zai-client';
import { mcpWebSearch } from './mcp-tools';

const PINECONE_API_KEY = process.env.PINECONE_API_KEY || '';

/**
 * تشغيل GLM-5.2 مع context.
 */
async function runWithContext(systemPrompt: string, context: string, query: string): Promise<string> {
  const client = await getZAIClient();
  const completion = await client.chat.completions.create({
    model: 'glm-5.2',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Context:\n${context.slice(0, 15000)}\n\nQuery: ${query}` },
    ],
    thinking: { type: 'enabled' },
    max_tokens: 65536,
    temperature: 1.0,
  });
  return completion?.choices?.[0]?.message?.content || '';
}

// ═══════════════════════════════════════════
// Pinecone Vector Search — بحث vector حقيقي
// بيـ embed السؤال بـ Gemini وبعدين بيدور في Pinecone index
// ═══════════════════════════════════════════
export async function pineconeVectorSearch(query: string, topK: number = 5): Promise<{
  success: boolean;
  matches: { text: string; score: number }[];
  error?: string;
}> {
  try {
    if (!PINECONE_API_KEY) {
      return { success: false, matches: [], error: 'PINECONE_API_KEY not configured' };
    }

    // 1. Embed الـ query باستخدام Gemini text-embedding-004
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
    if (!GEMINI_API_KEY) {
      return { success: false, matches: [], error: 'GEMINI_API_KEY needed for embeddings' };
    }

    const embedRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'models/text-embedding-004',
          content: { parts: [{ text: query }] },
        }),
      }
    );
    if (!embedRes.ok) {
      const errText = await embedRes.text().catch(() => '');
      throw new Error(`Embedding failed (${embedRes.status}): ${errText.slice(0, 200)}`);
    }
    const embedData = await embedRes.json();
    const queryVector: number[] = embedData?.embedding?.values || [];
    if (!queryVector.length) {
      throw new Error('Embedding returned empty vector');
    }

    // 2. ابحث في Pinecone. الـ index name ممكن يكون متغير — نجرب نستخدم index endpoint environment variable
    //    أو fallback للـ default pattern. الـ endpoint بينبعث من index name + environment.
    //    بنجرّب PINECONE_INDEX_URL (الأكثر دقة) أو fallback للنمط المتعارف عليه.
    const pineconeEndpoint = process.env.PINECONE_INDEX_URL || '';
    if (!pineconeEndpoint) {
      // مفيش endpoint — Pinecone محتاج index. نرجع empty بس success عشان fallback لـ web search
      return { success: true, matches: [] };
    }

    const searchRes = await fetch(`${pineconeEndpoint}/query`, {
      method: 'POST',
      headers: {
        'Api-Key': PINECONE_API_KEY,
        'Content-Type': 'application/json',
        'X-Pinecone-API-Version': '2024-07',
      },
      body: JSON.stringify({
        vector: queryVector,
        topK,
        includeMetadata: true,
      }),
    });

    if (!searchRes.ok) {
      // لو الـ index مش موجود أو فيه خطأ، نرجع empty (الـ caller هيـ fallback لـ web search)
      return { success: true, matches: [] };
    }

    const searchData = await searchRes.json();
    const matches: { text: string; score: number }[] = (searchData?.matches || [])
      .map((m: any) => ({
        text: m.metadata?.text || m.metadata?.content || '',
        score: typeof m.score === 'number' ? m.score : 0,
      }))
      .filter((m: { text: string; score: number }) => m.text);

    return { success: true, matches };
  } catch (e: any) {
    return { success: false, matches: [], error: e.message };
  }
}

/**
 * Agentic RAG v2 — Pinecone vector search حقيقي + GLM synthesis.
 * Chain:
 *   1. Pinecone vector search (real)
 *   2. لو Pinecone empty → fallback لـ web search (MCP)
 *   3. GLM-5.2 synthesis من الـ context
 */
export async function ragAgenticV2(query: string): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    // 1. بحث vector حقيقي في Pinecone
    const search = await pineconeVectorSearch(query, 5);

    let context = '';
    let source = '';
    if (search.success && search.matches.length > 0) {
      context = search.matches
        .map((m, i) => `[${i + 1}] (score: ${m.score.toFixed(2)}) ${m.text}`)
        .join('\n\n');
      source = '🗄️ Pinecone Vector DB';
    } else {
      // fallback لـ web search لو Pinecone empty أو فشل
      const webResult = await mcpWebSearch(query, 3);
      if (webResult.success && webResult.results.length > 0) {
        context = webResult.results
          .map((r: { title: string; snippet: string; url: string }, i: number) =>
            `[${i + 1}] ${r.title}\n${r.snippet}\nURL: ${r.url}`
          )
          .join('\n\n');
        source = '🌐 Web Search (fallback)';
      } else {
        context = 'لا يوجد context متاح — رد من المعرفة العامة.';
        source = '⚠️ لا يوجد مصدر (general knowledge)';
      }
    }

    // 2. synthesis بـ GLM-5.2
    const output = await runWithContext(
      `أنت Agentic RAG Agent. عندك context من ${source}. رد على السؤال بناء على الـ context. اذكر المصادر والاقتباسات. لو الـ context غير كافي، اذكر ده بوضوح.`,
      context,
      query
    );

    return {
      success: true,
      output: `**المصدر:** ${source}${search.error ? ` (${search.error})` : ''}\n\n${output}`,
    };
  } catch (e: any) {
    return { success: false, output: '', error: e.message };
  }
}

// ═══════════════════════════════════════════
// 1. Document Chat — شات مع مستند
// مستوحى من: document-chat-rag
// ═══════════════════════════════════════════
export async function ragDocChat(documentText: string, question: string): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    const output = await runWithContext(
      `أنت مساعد ذكي متخصص في تحليل المستندات. المستخدم رفع مستند وعاوز يسأل عليه.

القواعد:
1. ابحث في الـ context عن الإجابة الأول
2. لو لقيت الإجابة في الـ context، ارد بدقة من المستند
3. لو مش لاقي، قول "مفيش معلومات عن ده في المستند" ورد من معرفتك العامة
4. اذكر الصفحة أو القسم لو معروف
5. استشهد من المستند عند الحاجة`,
      documentText,
      question
    );
    return { success: true, output };
  } catch (e: any) { return { success: false, output: '', error: e.message }; }
}

// ═══════════════════════════════════════════
// 2. Agentic RAG — RAG وكيلي (مستند + ويب)
// مستوحى من: agentic_rag (CrewAI retriever + synthesizer)
// ═══════════════════════════════════════════
export async function ragAgentic(query: string, documentText?: string): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    // Step 1: لو فيه مستند، ابحث فيه
    let docContext = '';
    if (documentText && documentText.length > 50) {
      // محاكاة retrieval — GLM بيدور في الـ context
      const docResult = await runWithContext(
        `أنت retriever agent. ابحث في المستند عن معلومات تتعلق بالسؤال.
لو لقيت معلومات، لخصها. لو ملقتش، قول "NOT_FOUND_IN_DOCUMENT".`,
        documentText,
        query
      );
      if (!docResult.includes('NOT_FOUND')) {
        docContext = docResult;
      }
    }

    // Step 2: لو مش لقي في المستند، ابحث في الويب
    let webContext = '';
    if (!docContext) {
      const searchResult = await mcpWebSearch(query, 3);
      if (searchResult.success && searchResult.results.length > 0) {
        webContext = searchResult.results.map((r, i) =>
          `${i + 1}. ${r.title}\n   ${r.snippet}\n   URL: ${r.url}`
        ).join('\n\n');
      }
    }

    // Step 3: Response synthesizer
    const context = docContext || webContext || 'مفيش معلومات متاحة';
    const source = docContext ? '📄 المستند' : webContext ? '🌐 الويب' : '⚠️ لا يوجد مصدر';

    const output = await runWithContext(
      `أنت response synthesizer agent. ${docContext ? 'لقيت معلومات في المستند' : 'لقيت معلومات في الويب'}.
ركب إجابة واضحة ومتسقة من المعلومات المتاحة.
اذكر المصدر: ${source}`,
      context,
      query
    );

    return { success: true, output: `**المصدر:** ${source}\n\n${output}` };
  } catch (e: any) { return { success: false, output: '', error: e.message }; }
}

// ═══════════════════════════════════════════
// 3. GitHub RAG — شات مع GitHub repo
// مستوحى من: github-rag (gitingest + LlamaIndex)
// ═══════════════════════════════════════════
export async function ragGitHub(repoUrl: string, question: string): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    // محاكاة gitingest — نجيب README من GitHub API
    const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!match) return { success: false, output: '', error: 'URL مش GitHub صحيح' };

    const [, owner, repo] = match;
    const cleanRepo = repo.replace(/\.git$/, '').replace(/\/$/, '');

    // نجيب README — نجرّب main, master, و README بدون امتداد
    const readmeBranches = ['main', 'master'];
    const readmeFiles = ['README.md', 'readme.md', 'README.MD', 'README.rst', 'README.txt', 'README'];
    let repoContent = '';

    for (const branch of readmeBranches) {
      for (const file of readmeFiles) {
        if (repoContent) break;
        try {
          const readmeRes = await fetch(`https://raw.githubusercontent.com/${owner}/${cleanRepo}/${branch}/${file}`);
          if (readmeRes.ok) {
            repoContent = await readmeRes.text();
            break;
          }
        } catch {}
      }
    }

    // لو لسه ما لقيناش README، نجرّب GitHub API
    if (!repoContent) {
      try {
        const apiRes = await fetch(`https://api.github.com/repos/${owner}/${cleanRepo}/readme`, {
          headers: { 'Accept': 'application/vnd.github.v3.raw' },
        });
        if (apiRes.ok) repoContent = await apiRes.text();
      } catch {}
    }

    // نجيب معلومات الـ repo
    const repoInfoRes = await fetch(`https://api.github.com/repos/${owner}/${cleanRepo}`);
    let repoInfo = '';
    if (repoInfoRes.ok) {
      const info = await repoInfoRes.json();
      repoInfo = `Repo: ${info.full_name}\nDescription: ${info.description}\nStars: ${info.stargazers_count}\nLanguage: ${info.language}\nTopics: ${(info.topics || []).join(', ')}`;
    }

    const fullContext = `${repoInfo}\n\n--- README ---\n${repoContent.slice(0, 12000)}`;

    const output = await runWithContext(
      `أنت مساعد ذكي متخصص في تحليل مستودعات GitHub. المستخدم سأل عن المستودع ده.
حلل الـ README والمعلومات ورد على السؤال بدقة.`,
      fullContext,
      question || 'اعرض ملخص عن المشروع'
    );

    return { success: true, output: `📦 **GitHub: ${owner}/${cleanRepo}**\n\n${output}` };
  } catch (e: any) { return { success: false, output: '', error: e.message }; }
}

// ═══════════════════════════════════════════
// 4. Code Chat — شات مع كود
// مستوحى من: chat-with-code (CodeSplitter + RAG)
// ═══════════════════════════════════════════
export async function ragCodeChat(code: string, question: string): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    const output = await runWithContext(
      `أنت مساعد برمجي خبير. المستخدم رفع كود وعاوز يحلله.

القواعد:
1. حلل الكود بدقة
2. اشرح الوظائف الرئيسية
3. لو فيه bugs، اذكرها
4. اقترح تحسينات
5. اكتب أمثلة استخدام لو مناسب
6. استخدم code blocks في الرد`,
      code,
      question || 'اشرح الكود ده'
    );
    return { success: true, output: `💻 **تحليل الكود:**\n\n${output}` };
  } catch (e: any) { return { success: false, output: '', error: e.message }; }
}

// ═══════════════════════════════════════════
// 5. Corrective RAG — RAG تصحيحي
// مستوحى من: corrective-rag (verify + correct)
// ═══════════════════════════════════════════
export async function ragCorrective(query: string, documentText?: string): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    // Step 1: توليد إجابة أولية
    const initialAnswer = await runWithContext(
      `أنت مساعد ذكي. جاوب على السؤال من الـ context المتاح.`,
      documentText || 'مفيش context متاح، جاوب من معرفتك العامة.',
      query
    );

    // Step 2: تقييم الإجابة
    const evaluation = await runWithContext(
      `أنت evaluator agent. قيّم الإجابة دي:
- هل الإجابة دقيقة؟
- هل ناقصة معلومات؟
- فيه أخطاء؟

أعطي درجة من 0-10 واذكر المشاكل لو موجودة.`,
      `السؤال: ${query}\nالإجابة: ${initialAnswer}`,
      'قيّم الإجابة'
    );

    // Step 3: تصحيح لو لازم
    if (evaluation.includes('درجة:') && !evaluation.includes('درجة: 10')) {
      const corrected = await runWithContext(
        `أنت corrector agent. الإجابة الأصلية فيها مشاكل. صححها بناء على التقييم.

التقييم:
${evaluation}

الإجابة الأصلية:
${initialAnswer}

اكتب إجابة مصححة ومحسنة.`,
        '',
        query
      );
      return { success: true, output: `✅ **إجابة مصححة:**\n\n${corrected}\n\n---\n📊 **التقييم:**\n${evaluation}` };
    }

    return { success: true, output: `✅ **الإجابة:**\n\n${initialAnswer}\n\n---\n📊 **التقييم:**\n${evaluation}` };
  } catch (e: any) { return { success: false, output: '', error: e.message }; }
}

// ═══════════════════════════════════════════
// Registry
// ═══════════════════════════════════════════
export interface RAGToolDef {
  id: string;
  name: string;
  description: string;
  source: string;
  placeholder: string;
}

export const RAG_TOOLS: RAGToolDef[] = [
  { id: 'rag-doc-chat', name: '📄 شات مع مستند', description: 'محادثة مع PDF/DOCX/TXT — ابحث وأجب من المستند', source: 'document-chat-rag', placeholder: 'اكتب سؤالك عن المستند...' },
  { id: 'rag-agentic', name: '🤖 RAG وكيلي', description: 'RAG بيبحث في المستند الأول، لو ملقاش بيبحث في الويب', source: 'agentic_rag', placeholder: 'اكتب سؤالك...' },
  { id: 'rag-agentic-v2', name: '🗄️ Agentic RAG v2 (Pinecone)', description: 'RAG وكيلي بـ Pinecone vector DB حقيقي + Gemini embeddings + fallback لـ web search', source: 'agentic_rag_v2_pinecone', placeholder: 'اكتب سؤالك...' },
  { id: 'rag-github', name: '📦 شات مع GitHub', description: 'محادثة مع أي مستودع GitHub — حلل الـ README والمعلومات', source: 'github-rag', placeholder: 'https://github.com/user/repo' },
  { id: 'rag-code-chat', name: '💻 شات مع كود', description: 'تحليل وأسئلة على كود مرفوع', source: 'chat-with-code', placeholder: 'اكتب سؤالك عن الكود...' },
  { id: 'rag-corrective', name: '🔧 RAG تصحيحي', description: 'RAG بيقيم الإجابة ويصححها لو فيها أخطاء', source: 'corrective-rag', placeholder: 'اكتب سؤالك...' },
];

/**
 * تشغيل أداة RAG.
 */
export async function runRAGTool(toolId: string, input: string, context?: string): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    switch (toolId) {
      case 'rag-doc-chat':
        return await ragDocChat(context || input, input);
      case 'rag-agentic':
        return await ragAgentic(input, context);
      case 'rag-agentic-v2':
        return await ragAgenticV2(input);
      case 'rag-github': {
        // input هو URL، نحتاج سؤال كمان
        const [url, ...rest] = input.split(' ');
        const question = rest.join(' ') || 'اعرض ملخص عن المشروع';
        return await ragGitHub(url, question);
      }
      case 'rag-code-chat':
        return await ragCodeChat(context || input, input);
      case 'rag-corrective':
        return await ragCorrective(input, context);
      default:
        return { success: false, output: '', error: `أداة RAG غير معروفة: ${toolId}` };
    }
  } catch (e: any) {
    return { success: false, output: '', error: e.message };
  }
}
