/**
 * POST /api/ai/ocr
 * Unified OCR Route (Projects #1, #2, #3, #4)
 * 
 * Supports: LaTeX-OCR, Llama-OCR, Gemma3-OCR, Qwen-2.5VL-OCR
 * All powered by ZAI Vision (GLM-4V) — the best available vision model.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getZAIClient } from '@/lib/zai-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      image: string;          // URL or base64 data URI
      mode?: 'latex' | 'structured' | 'plain' | 'auto';
      language?: string;
    };

    if (!body.image) {
      return NextResponse.json({ error: 'image required' }, { status: 400 });
    }

    const mode = body.mode || 'auto';
    const zai = await getZAIClient();

    const prompts: Record<string, string> = {
      latex: 'Extract the mathematical equations from this image and convert them to LaTeX format. Return ONLY the LaTeX code, no explanations.',
      structured: 'Extract ALL text from this image in a structured format. Preserve headings, paragraphs, lists, and tables. Use markdown formatting.',
      plain: 'Extract ALL text from this image. Return ONLY the raw text, preserving line breaks and layout.',
      auto: 'Extract all text from this image. If there are mathematical equations, convert them to LaTeX. Preserve the document structure using markdown.',
    };

    const completion = await zai.chat.completions.createVision({
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompts[mode] },
          { type: 'image_url', image_url: { url: body.image } },
        ],
      }],
      thinking: { type: 'disabled' },
    } as any);

    const text = completion.choices?.[0]?.message?.content || '';

    // Detect if LaTeX was extracted
    const hasLatex = /\\\[|\\\(|\\frac|\\sum|\\int|\\alpha|\\beta/i.test(text);

    return NextResponse.json({
      success: true,
      text,
      mode,
      hasLatex,
      model: 'glm-4v',
    });
  } catch (error) {
    return NextResponse.json({ error: 'OCR failed', detail: error instanceof Error ? error.message : 'unknown' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    name: 'Unified OCR',
    modes: ['latex', 'structured', 'plain', 'auto'],
    models: ['LaTeX-OCR', 'llama-ocr', 'gemma3-ocr', 'qwen-2.5VL-ocr'],
    note: 'All modes powered by GLM-4V vision model',
  });
}
