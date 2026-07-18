/**
 * GET /api/ai/ai-roadmap
 * AI Engineering Roadmap (Project #105)
 */
import { NextResponse } from 'next/server';
export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({
    title: 'AI Engineering Roadmap',
    phases: [
      { phase: 1, title: 'الأساسيات', topics: ['Python', 'NumPy', 'Pandas', 'Git', 'HTTP APIs'] },
      { phase: 2, title: 'التعلم الآلي', topics: ['Scikit-learn', 'Feature engineering', 'Model evaluation'] },
      { phase: 3, title: 'التعلم العميق', topics: ['PyTorch', 'CNNs', 'Transformers', 'Fine-tuning'] },
      { phase: 4, title: 'LLMs + AI Apps', topics: ['Prompt engineering', 'RAG', 'Agents', 'Multi-modal'] },
      { phase: 5, title: 'الإنتاج والنشر', topics: ['Docker', 'Model serving', 'Monitoring', 'Security'] },
      { phase: 6, title: 'متقدم', topics: ['MCP', 'Agent orchestration', 'Distillation', 'GRPO/RLHF'] },
    ],
  });
}
