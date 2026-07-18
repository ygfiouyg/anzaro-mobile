// ═══════════════════════════════════════════════════════════════════════
// DeltaAI Voice Pipeline Benchmark — REAL runtime execution
// ═══════════════════════════════════════════════════════════════════════
// Pipeline:  Groq Whisper-large-v3-turbo (STT)
//         →  Groq Llama-3.1-8b-instant  (LLM, Egyptian Arabic system prompt)
//         →  Microsoft Edge TTS ar-EG-ShakirNeural (TTS)
//
// Every stage is executed against the LIVE provider. NO mock data.
// All timings use process.hrtime.bigint() (nanosecond resolution).
//
// GET  /api/ai/voice-benchmark            → run benchmark, return JSON report
// POST /api/ai/voice-benchmark            → same (alias)
// ?sttModel=whisper-large-v3              → override STT model
// ?llmModel=llama-3.3-70b-versatile       → override LLM model
// ?voice=ar-EG-SalmaNeural                → override Edge TTS voice
// ?fixture=regenerate                     → force regenerate the Arabic audio fixture
// ═══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { synthesizeSpeech, EGYPTIAN_VOICES } from '@/lib/edge-tts';
import {
  groqWhisperSTT,
  groqChatTimed,
  groqPlayAITTS,
  now, msSince, type HrTime, type StageTiming,
} from '@/lib/groq-audio';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// ─── Fixture cache (real Egyptian Arabic audio for STT input) ──────────
const FIXTURE_DIR = join(tmpdir(), 'delta-voice-bench');
const FIXTURE_PATH = join(FIXTURE_DIR, 'egyptian-arabic-sample.mp3');

/** The Egyptian Arabic phrase we feed to Groq Whisper (MSA + Egyptian flavour). */
const FIXTURE_TEXT = 'السلام عليكم، إزيك يا صديقي؟ أنا باشتغل صح في القاهرة النهاردة، وعاوز أساعدك في أي حاجة محتاجها.';

/** Egyptian Arabic system prompt for the LLM stage. */
const EGYPTIAN_SYSTEM_PROMPT = `إنت مساعد ذكي بتتكلم بالعربي المصري بلهجة طبيعية وكأنك من القاهرة.
رُدّ على المستخدم بجملة قصيرة (أقل من 25 كلمة) وودودة، واستخدم تعبيرات مصرية زي "إزيك"، "تمام"، "يا باشا".
خلي ردك عملي ومباشر ومن غير مقدمات طويلة.`;

interface StageReport {
  label: string;
  provider: string;
  model: string;
  ttfbMs: number;
  totalMs: number;
  bytes: number;
  status: number;
  error?: string;
  extra?: Record<string, unknown>;
}

/** Ensure a real Egyptian Arabic audio fixture exists on disk. */
async function ensureFixture(regenerate: boolean): Promise<{ path: string; bytes: number; generatedAt: string; text: string }> {
  if (!existsSync(FIXTURE_DIR)) mkdirSync(FIXTURE_DIR, { recursive: true });
  if (!regenerate && existsSync(FIXTURE_PATH)) {
    const stat = readFileSync(FIXTURE_PATH);
    if (stat.length > 500) {
      return {
        path: FIXTURE_PATH,
        bytes: stat.length,
        generatedAt: new Date().toISOString(),
        text: FIXTURE_TEXT,
      };
    }
  }
  // Generate a fresh real audio sample using Edge TTS (NOT counted in benchmark)
  const buf = await synthesizeSpeech({
    text: FIXTURE_TEXT,
    voice: EGYPTIAN_VOICES.male, // ar-EG-ShakirNeural
    rate: '+0%',
    pitch: '+0Hz',
  });
  writeFileSync(FIXTURE_PATH, buf);
  return {
    path: FIXTURE_PATH,
    bytes: buf.length,
    generatedAt: new Date().toISOString(),
    text: FIXTURE_TEXT,
  };
}

/** Simulate the client-side ArrayBuffer → Blob({type:'audio/mpeg'}) mapping. */
function measureBlobMapping(audio: Buffer, mimeType: string): { blobMs: number; blobSize: number } {
  const start = now();
  // Server-side equivalent: Uint8Array view + Blob construction (web Blob available in Node 18+)
  const u8 = new Uint8Array(audio.buffer, audio.byteOffset, audio.byteLength);
  // @ts-ignore — Blob is global in Node 18+
  const blob = new Blob([u8], { type: mimeType });
  const blobMs = msSince(start);
  return { blobMs, blobSize: blob.size };
}

export async function GET(request: NextRequest) {
  return runBenchmark(request);
}
export async function POST(request: NextRequest) {
  return runBenchmark(request);
}

async function runBenchmark(request: NextRequest): Promise<Response> {
  const sp = request.nextUrl.searchParams;
  const sttModel = (sp.get('sttModel') as any) || 'whisper-large-v3-turbo';
  const llmModel = sp.get('llmModel') || 'llama-3.1-8b-instant';
  const edgeVoice = sp.get('voice') || EGYPTIAN_VOICES.male; // ar-EG-ShakirNeural
  const regenerate = sp.get('fixture') === 'regenerate';
  const edgeOnly = sp.get('edgeOnly') === '1';

  const benchStart: HrTime = now();
  const ts = () => new Date().toISOString();
  const log: string[] = [];

  log.push(`[${ts()}] === VOICE PIPELINE BENCHMARK START ===`);
  log.push(`[${ts()}] STT model : ${sttModel}`);
  log.push(`[${ts()}] LLM model : ${llmModel}`);
  log.push(`[${ts()}] TTS voice : ${edgeVoice} (Microsoft Edge TTS)`);
  if (edgeOnly) log.push(`[${ts()}] MODE: edgeOnly — skipping Groq STT/LLM, running Edge TTS stage with a fixed Egyptian prompt.`);

  // ── 0. Fixture preparation (NOT counted) ───────────────────────────
  let fixture: { path: string; bytes: number; generatedAt: string; text: string };
  try {
    fixture = await ensureFixture(regenerate);
    log.push(`[${ts()}] fixture ready: ${fixture.path} (${fixture.bytes} bytes)`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.push(`[${ts()}] FIXTURE FAILED: ${msg}`);
    return NextResponse.json({ ok: false, error: 'fixture generation failed', detail: msg, log }, { status: 500 });
  }

  // ── EDGE-ONLY MODE: skip Groq, run Edge TTS on a fixed Egyptian reply ──
  if (edgeOnly) {
    const fixedReply = 'تمام يا باشا، أنا معاك حالا. هحلّ المشكلة دي في ثواني وخلاص.';
    log.push(`[${ts()}] STAGE 3 (TTS) → Edge TTS ${edgeVoice} (edgeOnly) ...`);
    const ttsStart = now();
    let edgeAudio: Buffer = Buffer.alloc(0);
    let edgeErr: string | undefined;
    try {
      edgeAudio = await synthesizeSpeech({ text: fixedReply, voice: edgeVoice, rate: '+0%', pitch: '+0Hz' });
    } catch (e) { edgeErr = e instanceof Error ? e.message : String(e); }
    const edgeTotal = msSince(ttsStart);
    const blobMap = edgeAudio.length > 0 ? measureBlobMapping(edgeAudio, 'audio/mpeg') : { blobMs: -1, blobSize: 0 };
    const ttsStage: StageReport = {
      label: 'TTS', provider: 'edge-tts', model: edgeVoice,
      ttfbMs: edgeTotal, totalMs: edgeTotal, bytes: edgeAudio.length,
      status: edgeErr ? 502 : 200, error: edgeErr,
      extra: {
        mimeType: 'audio/mpeg', blobMappingMs: blobMap.blobMs, blobSize: blobMap.blobSize,
        bufferToBlobUnder400ms: blobMap.blobMs >= 0 && blobMap.blobMs < 400,
        inputText: fixedReply,
        note: 'edgeOnly mode: Edge TTS child-process path (no Groq dependency).',
      },
    };
    const totalMs = msSince(benchStart);
    log.push(`[${ts()}] TTS done: total=${edgeTotal.toFixed(1)}ms bytes=${edgeAudio.length} blobMap=${blobMap.blobMs.toFixed(2)}ms`);
    log.push(`[${ts()}] === BENCHMARK (edgeOnly) COMPLETE === total=${totalMs.toFixed(1)}ms`);
    for (const line of log) console.log(`[voice-benchmark] ${line}`);
    return NextResponse.json({
      ok: !edgeErr,
      timestamp: ts(),
      mode: 'edgeOnly',
      pipeline: 'Microsoft Edge TTS only (Groq skipped)',
      stages: { tts: ttsStage },
      summary: {
        totalMs,
        ttsMs: edgeTotal,
        blobMappingMs: blobMap.blobMs,
        blobMappingUnder400ms: blobMap.blobMs >= 0 && blobMap.blobMs < 400,
        ttsBytes: edgeAudio.length,
      },
      log,
    });
  }

  const audioBytes = readFileSync(fixture.path);

  // ── STAGE 1 — STT: Groq Whisper ───────────────────────────────────
  log.push(`[${ts()}] STAGE 1 (STT) → Groq ${sttModel} ...`);
  const sttResult = await groqWhisperSTT(audioBytes, 'egyptian-arabic-sample.mp3', {
    model: sttModel,
    language: 'ar',
    timeoutMs: 15_000,
  });
  const sttStage: StageReport = {
    label: 'STT',
    provider: 'groq',
    model: sttModel,
    ttfbMs: sttResult.timing.ttfbMs,
    totalMs: sttResult.timing.totalMs,
    bytes: sttResult.timing.bytes,
    status: sttResult.timing.status,
    error: sttResult.timing.error,
    extra: {
      transcribed: sttResult.text,
      audioDurationSec: sttResult.durationSec,
      rtf: sttResult.durationSec ? sttResult.durationSec / (sttResult.timing.totalMs / 1000) : undefined,
    },
  };
  log.push(`[${ts()}] STT done: ttfb=${sttStage.ttfbMs.toFixed(1)}ms total=${sttStage.totalMs.toFixed(1)}ms status=${sttStage.status} text="${sttResult.text.slice(0,60)}"`);

  if (sttStage.error || !sttResult.text) {
    log.push(`[${ts()}] STT failed — aborting pipeline`);
    return NextResponse.json({ ok: false, stage: 'STT', log, stt: sttStage }, { status: 502 });
  }

  // ── STAGE 2 — LLM: Groq Llama (Egyptian prompt) ───────────────────
  log.push(`[${ts()}] STAGE 2 (LLM) → Groq ${llmModel} ...`);
  const llmResult = await groqChatTimed(
    [
      { role: 'system', content: EGYPTIAN_SYSTEM_PROMPT },
      { role: 'user', content: sttResult.text },
    ],
    { model: llmModel, temperature: 0.6, maxTokens: 120, timeoutMs: 30_000 }
  );
  const llmStage: StageReport = {
    label: 'LLM',
    provider: 'groq',
    model: llmModel,
    ttfbMs: llmResult.timing.ttfbMs,
    totalMs: llmResult.timing.totalMs,
    bytes: llmResult.timing.bytes,
    status: llmResult.timing.status,
    error: llmResult.timing.error,
    extra: {
      reply: llmResult.text,
      tokensIn: llmResult.timing.tokensIn,
      tokensOut: llmResult.timing.tokensOut,
      tps: llmResult.timing.tps,
    },
  };
  log.push(`[${ts()}] LLM done: ttfb=${llmStage.ttfbMs.toFixed(1)}ms total=${llmStage.totalMs.toFixed(1)}ms toks_out=${llmResult.timing.tokensOut} tps=${llmResult.timing.tps?.toFixed(0)} reply="${llmResult.text.slice(0,60)}"`);

  if (llmStage.error || !llmResult.text) {
    log.push(`[${ts()}] LLM failed — aborting pipeline`);
    return NextResponse.json({ ok: false, stage: 'LLM', log, stt: sttStage, llm: llmStage }, { status: 502 });
  }

  // ── STAGE 3 — TTS: Microsoft Edge TTS (ar-EG-ShakirNeural) ────────
  log.push(`[${ts()}] STAGE 3 (TTS) → Edge TTS ${edgeVoice} ...`);
  const ttsStart = now();
  let edgeAudio: Buffer = Buffer.alloc(0);
  let edgeTtfb = -1;
  let edgeErr: string | undefined;
  try {
    // synthesizeSpeech returns the full buffer; we treat first-byte as the spawn→resolve latency
    // since Edge TTS (child-process impl) doesn't expose a streaming first-byte hook here.
    edgeAudio = await synthesizeSpeech({
      text: llmResult.text,
      voice: edgeVoice,
      rate: '+0%',
      pitch: '+0Hz',
    });
    edgeTtfb = msSince(ttsStart); // approximated as total for non-streaming child-process path
  } catch (e) {
    edgeErr = e instanceof Error ? e.message : String(e);
  }
  const edgeTotal = msSince(ttsStart);

  // Buffer → Blob mapping (client-side playback prep simulation)
  const blobMap = edgeAudio.length > 0 ? measureBlobMapping(edgeAudio, 'audio/mpeg') : { blobMs: -1, blobSize: 0 };

  const ttsStage: StageReport = {
    label: 'TTS',
    provider: 'edge-tts',
    model: edgeVoice,
    ttfbMs: edgeTtfb,
    totalMs: edgeTotal,
    bytes: edgeAudio.length,
    status: edgeErr ? 502 : 200,
    error: edgeErr,
    extra: {
      mimeType: 'audio/mpeg',
      blobMappingMs: blobMap.blobMs,
      blobSize: blobMap.blobSize,
      bufferToBlobUnder400ms: blobMap.blobMs >= 0 && blobMap.blobMs < 400,
      note: 'Edge TTS uses a child-process spawn (msedge-tts); TTFB ≈ total because the child writes the whole file then resolves.',
    },
  };
  log.push(`[${ts()}] TTS done: total=${edgeTotal.toFixed(1)}ms bytes=${edgeAudio.length} blobMap=${blobMap.blobMs.toFixed(2)}ms`);

  // ── Aggregate ──────────────────────────────────────────────────────
  const totalMs = msSince(benchStart);
  const stages = [sttStage, llmStage, ttsStage];
  const allOk = stages.every(s => !s.error && s.status === 200);

  // End-to-end "first audio byte" latency = STT total + LLM TTFB + TTS first byte
  const e2eFirstAudioMs = sttStage.totalMs + llmStage.ttfbMs + (ttsStage.ttfbMs >= 0 ? ttsStage.ttfbMs : ttsStage.totalMs);

  const report = {
    ok: allOk,
    timestamp: ts(),
    pipeline: 'Groq Whisper STT → Groq Llama LLM → Microsoft Edge TTS',
    freeForever: true,
    fixture: {
      path: fixture.path,
      bytes: fixture.bytes,
      text: fixture.text,
      generatedAt: fixture.generatedAt,
    },
    stages: {
      stt: sttStage,
      llm: llmStage,
      tts: ttsStage,
    },
    summary: {
      totalMs,
      totalSec: +(totalMs / 1000).toFixed(3),
      e2eFirstAudioMs,
      e2eFirstAudioSec: +(e2eFirstAudioMs / 1000).toFixed(3),
      stagesSumMs: +(sttStage.totalMs + llmStage.totalMs + ttsStage.totalMs).toFixed(2),
      overheadMs: +(totalMs - (sttStage.totalMs + llmStage.totalMs + ttsStage.totalMs)).toFixed(2),
      blobMappingMs: blobMap.blobMs,
      blobMappingUnder400ms: blobMap.blobMs >= 0 && blobMap.blobMs < 400,
      e2eUnder400ms: e2eFirstAudioMs < 400,
      sttRtf: sttStage.extra?.rtf,
      llmTps: llmStage.extra?.tps,
    },
    log,
  };

  log.push(`[${ts()}] === BENCHMARK COMPLETE === total=${totalMs.toFixed(1)}ms e2eFirstAudio=${e2eFirstAudioMs.toFixed(1)}ms blobMap=${blobMap.blobMs.toFixed(2)}ms`);

  // Echo the full log to server stdout for live tracing
  for (const line of log) console.log(`[voice-benchmark] ${line}`);

  return NextResponse.json(report, { status: allOk ? 200 : 502 });
}
