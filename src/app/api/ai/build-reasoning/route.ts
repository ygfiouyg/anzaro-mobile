/**
 * POST /api/ai/build-reasoning
 * Build Reasoning Model (Project #102)
 * 
 * Creates a reasoning model training pipeline that teaches an LLM
 * to produce step-by-step reasoning (chain-of-thought) before answers.
 */

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      baseModel: string;       // e.g. "Qwen/Qwen2.5-7B"
      reasoningStyle: 'cot' | 'tot' | 'react' | 'self-consistency';
      domain?: string;         // e.g. "math", "coding", "medical"
      datasetFormat?: 'openai' | 'alpaca' | 'sharegpt';
    };

    if (!body.baseModel) {
      return NextResponse.json({ error: 'baseModel required' }, { status: 400 });
    }

    const script = generateReasoningScript(body);

    return NextResponse.json({
      success: true,
      config: {
        ...body,
        reasoningStyle: body.reasoningStyle || 'cot',
        domain: body.domain || 'general',
        datasetFormat: body.datasetFormat || 'sharegpt',
      },
      script,
      estimatedTime: '4-12 hours on A100 40GB',
      estimatedVRAM: '24-40GB',
    });
  } catch (error) {
    return NextResponse.json({ error: 'Build reasoning failed' }, { status: 500 });
  }
}

function generateReasoningScript(config: any): string {
  const stylePrompts: Record<string, string> = {
    cot: 'Think step by step before answering. Show your reasoning in <think> tags.',
    tot: 'Explore multiple approaches, evaluate each, then select the best. Use <approach> tags.',
    react: 'Use Reason+Act pattern. Think (Reason), take action (Act), observe (Observe), repeat.',
    'self-consistency': 'Generate 3 different solutions, then select the most consistent answer.',
  };

  return `# Anzaro Reasoning Model Builder — ${config.reasoningStyle.toUpperCase()}
# Base: ${config.baseModel}
# Domain: ${config.domain || 'general'}

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from trl import SFTTrainer, SFTConfig
from datasets import load_dataset, Dataset

REASONING_PROMPT = """${stylePrompts[config.reasoningStyle] || stylePrompts.cot}"""

# ── Generate reasoning dataset ──
def add_reasoning(example):
    """Inject reasoning instruction into each example."""
    example["instruction"] = REASONING_PROMPT + "\\n\\n" + example.get("instruction", "")
    return example

# ── Load and augment dataset ──
MODEL = "${config.baseModel}"
tokenizer = AutoTokenizer.from_pretrained(MODEL)
model = AutoModelForCausalLM.from_pretrained(MODEL, torch_dtype=torch.bfloat16, device_map="auto")

# Load your domain dataset (replace with actual dataset)
dataset = load_dataset("${config.datasetFormat || 'sharegpt'}")
dataset = dataset.map(add_reasoning)

# ── Train with reasoning-focused config ──
config = SFTConfig(
    output_dir="./anzaro-reasoning",
    num_train_epochs=3,
    learning_rate=1e-5,  # Lower LR for reasoning preservation
    per_device_train_batch_size=2,
    gradient_accumulation_steps=8,
    max_seq_length=4096,  # Longer for reasoning chains
    warmup_ratio=0.1,
    save_strategy="epoch",
)

trainer = SFTTrainer(
    model=model,
    args=config,
    train_dataset=dataset["train"],
    processing_class=tokenizer,
)

trainer.train()
trainer.save_model("./anzaro-reasoning")
print("✅ Reasoning model saved!")
`;
}

export async function GET() {
  return NextResponse.json({
    name: 'Build Reasoning Model',
    styles: ['cot', 'tot', 'react', 'self-consistency'],
    note: 'Generates a training script that teaches an LLM step-by-step reasoning.',
  });
}
