/**
 * POST /api/ai/corrective-rag
 * Corrective RAG (Project #108)
 * 
 * CRAG: Self-correcting RAG that evaluates retrieval quality
 * and falls back to web search when retrieved docs are irrelevant.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getZAIClient } from '@/lib/zai-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const { query, documents, threshold } = await request.json() as {
      query: string;
      documents: Array<{ text: string; source?: string }>;
      threshold?: number;
    };

    if (!query || !documents?.length) {
      return NextResponse.json({ error: 'query and documents required' }, { status: 400 });
    }

    const zai = await getZAIClient();
    const confidenceThreshold = threshold || 0.5;

    // Step 1: Evaluate document relevance
    const evalCompletion = await zai.chat.completions.create({
      messages: [{
        role: 'user',
        content: `Rate the relevance of each document to the query on a scale of 0-1.
Return JSON: {"scores": [0.8, 0.2, ...]}

Query: ${query}

Documents:
${documents.map((d, i) => `[${i}] ${d.text.slice(0, 500)}`).join('\n\n')}`,
      }],
      temperature: 0.1,
      max_tokens: 200,
    });

    let scores: number[] = [];
    try {
      const match = evalCompletion.choices?.[0]?.message?.content?.match(/\{[\s\S]*\}/);
      if (match) scores = JSON.parse(match[0]).scores || [];
    } catch {}

    // Step 2: Filter relevant docs
    const relevantDocs = documents.filter((_, i) => (scores[i] || 0) >= confidenceThreshold);
    const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

    let finalContext = '';
    let action = 'use_docs';

    if (relevantDocs.length > 0 && avgScore >= confidenceThreshold) {
      // Documents are relevant — use them
      finalContext = relevantDocs.map(d => d.text).join('\n\n');
      action = 'use_docs';
    } else {
      // Documents are irrelevant — fall back to web search
      action = 'web_search';
      try {
        const searchResults = await zai.functions.invoke('web_search', { query, num: 3 });
        finalContext = JSON.stringify(searchResults);
      } catch {
        finalContext = 'Web search unavailable. Using best available document.';
        finalContext += '\n\n' + documents[0]?.text?.slice(0, 1000) || '';
      }
    }

    // Step 3: Generate answer with the corrected context
    const answerCompletion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: `Answer based on the following context. If the context is insufficient, say so.\n\nContext:\n${finalContext}` },
        { role: 'user', content: query },
      ],
      temperature: 0.3,
      max_tokens: 1000,
    });

    return NextResponse.json({
      success: true,
      answer: answerCompletion.choices?.[0]?.message?.content || '',
      action,
      avgConfidence: avgScore,
      docsUsed: relevantDocs.length,
      totalDocs: documents.length,
      webSearchTriggered: action === 'web_search',
    });
  } catch (error) {
    return NextResponse.json({ error: 'Corrective RAG failed', detail: error instanceof Error ? error.message : 'unknown' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    name: 'Corrective RAG (CRAG)',
    description: 'Self-correcting RAG — evaluates retrieval quality, falls back to web search',
  });
}
