/**
 * POST /api/ai/distillation
 * Knowledge Distillation (Project #104)
 * 
 * Transfers knowledge from a large teacher model to a smaller student model.
 * The teacher generates reasoning traces; the student learns to mimic them.
 */

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      teacherModel: string;    // e.g. "deepseek-ai/DeepSeek-R1" (large)
      studentModel: string;    // e.g. "Qwen/Qwen2.5-1.5B" (small)
      domain?: string;
      numSamples?: number;     // how many teacher samples to generate
    };

    if (!body.teacherModel || !body.studentModel) {
      return NextResponse.json({ error: 'teacherModel and studentModel required' }, { status: 400 });
    }

    const script = generateDistillationScript(body);

    return NextResponse.json({
      success: true,
      config: {
        ...body,
        numSamples: body.numSamples || 10000,
        domain: body.domain || 'general',
      },
      script,
      pipeline: [
        '1. Teacher model generates reasoning traces on a dataset',
        '2. Filter traces by quality (length, correctness)',
        '3. Student model trains on the filtered traces (SFT)',
        '4. Evaluate student vs teacher on benchmarks',
        '5. Upload distilled student model to HuggingFace',
      ],
    });
  } catch (error) {
    return NextResponse.json({ error: 'Distillation failed' }, { status: 500 });
  }
}

function generateDistillationScript(config: any): string {
  return `# Anzaro Knowledge Distillation Pipeline
# Teacher: ${config.teacherModel}
# Student: ${config.studentModel}

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from trl import SFTTrainer, SFTConfig
from datasets import load_dataset, Dataset
import json

TEACHER = "${config.teacherModel}"
STUDENT = "${config.studentModel}"
NUM_SAMPLES = ${config.numSamples || 10000}

# ── Phase 1: Generate teacher traces ──
print("📚 Phase 1: Generating teacher reasoning traces...")
teacher_tok = AutoTokenizer.from_pretrained(TEACHER)
teacher_model = AutoModelForCausalLM.from_pretrained(TEACHER, torch_dtype=torch.bfloat16, device_map="auto")

# Load seed dataset
seed_dataset = load_dataset("openai/gsm8k", "main")["train"]  # Replace with your domain dataset

def generate_teacher_trace(question):
    prompt = f"Question: {question}\\nThink step by step:\\n"
    inputs = teacher_tok(prompt, return_tensors="pt").to(teacher_model.device)
    outputs = teacher_model.generate(**inputs, max_new_tokens=512, temperature=0.7, do_sample=True)
    return teacher_tok.decode(outputs[0], skip_special_tokens=True)

# Generate traces
traces = []
for i, example in enumerate(seed_dataset.select(range(min(NUM_SAMPLES, len(seed_dataset))))):
    trace = generate_teacher_trace(example["question"])
    traces.append({"question": example["question"], "answer": example["answer"], "trace": trace})
    if (i + 1) % 100 == 0:
        print(f"  Generated {i + 1}/{NUM_SAMPLES}")

# Save traces
with open("teacher_traces.jsonl", "w") as f:
    for t in traces:
        f.write(json.dumps(t) + "\\n")

# ── Phase 2: Train student on teacher traces ──
print("🎓 Phase 2: Training student model on teacher traces...")
student_tok = AutoTokenizer.from_pretrained(STUDENT)
student_model = AutoModelForCausalLM.from_pretrained(STUDENT, torch_dtype=torch.bfloat16, device_map="auto")

train_data = Dataset.from_list([
    {"instruction": t["question"], "output": t["trace"]}
    for t in traces
])

config = SFTConfig(
    output_dir="./anzaro-distilled",
    num_train_epochs=3,
    learning_rate=2e-5,
    per_device_train_batch_size=8,
    max_seq_length=1024,
    save_strategy="epoch",
)

trainer = SFTTrainer(
    model=student_model,
    args=config,
    train_dataset=train_data,
    processing_class=student_tok,
)

trainer.train()
trainer.save_model("./anzaro-distilled")
print("✅ Distilled model saved!")
`;
}

export async function GET() {
  return NextResponse.json({
    name: 'Knowledge Distillation',
    description: 'Transfers knowledge from large teacher to small student model',
  });
}
