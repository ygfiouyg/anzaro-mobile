# 🏛️ تقرير هندسي شامل — منصة Anzaro AI
## Senior Solutions Architect Audit — Hugging Face Spaces

---

## 1. الهيكل العام للمشروع (Architecture & File Structure)

### ملخص الأرقام

| المعيار | العدد |
|---|---|
| إجمالي ملفات `src/lib/` | 74 ملف + 340 أداة MCP |
| مسارات API | 175+ route handler |
| مكونات الواجهة | 48 في `src/components/chat/` + 49 shadcn/ui |
| نماذج قاعدة البيانات | 18 نموذج Prisma |
| مزودي AI | 12+ مزود (Groq, Cerebras, Gemini, OpenRouter, OpenAI, Anthropic, Cloudflare, GitHub, Pollinations, HuggingFace, ZAI) |
| نماذج الشات | 27 نموذج |
| Mini-services | 3 خدمات (mcp-server, mcp-engine, voice-service) |
| إجمالي سطور الكود | ~39,000 سطر TypeScript في `src/lib/` وحدها |

### شجرة المجلدات الرئيسية

```
src/
├── app/
│   ├── api/                    ← 175+ route handler
│   │   ├── admin/              ← 25 route (إدارة)
│   │   ├── ai/                 ← 45+ route (AI/TTS/ASR/Vision)
│   │   ├── auth/               ← 10 routes (مصادقة)
│   │   ├── chat/               ← 10 routes (محادثة)
│   │   ├── mcp/                ← 10 routes (MCP jobs)
│   │   ├── spotify/            ← 10 routes
│   │   └── ... (30+ مجلد فرعي)
│   ├── layout.tsx              ← RTL + Theme + Fonts (Cairo)
│   ├── page.tsx                ← الصفحة الرئيسية
│   └── globals.css             ← Tailwind 4 + Gemini-inspired design
├── components/
│   ├── chat/                   ← 48 مكون (ChatApp, MessageBubble, ChatInput...)
│   ├── ui/                     ← 49 مكون shadcn/ui
│   ├── admin/                  ← 6 مكونات لوحة الإدارة
│   └── agents/                 ← 6 مكونات Agent Builder
├── hooks/
│   ├── use-audio.ts            ← 726 سطر (voice pipeline كامل)
│   ├── use-mobile.ts
│   └── use-toast.ts
├── lib/
│   ├── groq.ts                 ← 727 سطر — Groq LPU
│   ├── cerebras.ts             ← 760 سطر — Cerebras (مجاني)
│   ├── gemini.ts               ← 1,221 سطر — Google Gemini
│   ├── openrouter.ts           ← 804 سطر — OpenRouter
│   ├── anthropic.ts            ← 316 سطر — Claude
│   ├── cloudflare-ai.ts        ← 256 سطر — Workers AI
│   ├── pollinations.ts         ← 2,477 سطر — مجاني
│   ├── huggingface.ts          ← 1,470 سطر — HF Inference
│   ├── hf-chat.service.ts      ← 1,134 سطر — HF Chat models
│   ├── edge-tts.ts             ← Microsoft Edge TTS
│   ├── groq-audio.ts           ← Groq Whisper STT + PlayAI TTS
│   ├── models.ts               ← 27 نموذج شات
│   ├── image-models.ts         ← 13 نموذج صور
│   ├── video-models.ts         ← 7 نماذج فيديو
│   ├── edge-tts.ts             ← Edge TTS service
│   ├── mcp/tools/              ← 340 أداة MCP
│   └── ... (74 ملف إجمالاً)
├── store/
│   ├── chat-store.ts           ← 1,836 سطر (Zustand)
│   └── auth-store.ts           ← 321 سطر
└── proxy.ts                    ← Next.js middleware (Caddy proxy)

mini-services/
├── mcp-server/                 ← خادم MCP مستقل (port 3001)
├── mcp-engine/                 ← عميل MCP تجريبي (port 3001)
└── voice-service/              ← خدمة راديو + صوت (port 3005)
```

### نماذج قاعدة البيانات (18 نموذج)

| النموذج | الوظيفة | حقول مهمة |
|---|---|---|
| `User` | حسابات المستخدمين | `email`, `password` (bcrypt), `role`, `maxTokens` (60000), `streak` |
| `Conversation` | جلسات المحادثة | `title`, `model`, `language`, `context` (general/islamic/code/creative) |
| `Message` | الرسائل | `content`, `role`, `model`, `emotion`, `attachments` (JSON), `pdfUrl` |
| `AdminSettings` | إعدادات النظام | `key`, `value` (JSON), `category` — يخزن كل الـ API keys |
| `GenerativeAsset` | الملفات المولدة | `type` (pdf/image/audio/video), `filePath`, `fileSize` |
| `Podcast` | حلقات البودكاست | `audioUrl`, `duration`, `episode` |
| `RadioStation` | محطات الراديو | `streamUrl`, `category` (islamic/music/news/quran) |
| `VoiceBroadcast` | بث صوتي | `audioUrl`, `playedCount` |
| `UserMemory` | ذاكرة المستخدم | `category`, `key`, `value`, `confidence` |
| `Achievement` / `UserAchievement` | إنجازات | `points`, `requirement` |
| `DailyChallenge` | تحديات يومية | `type`, `targetCount`, `points` |
| `UserStats` | إحصائيات | `totalPoints`, `level`, `totalChats`, `currentStreak` |
| `DocumentMemory` | تجميع مستندات | `status` (uploaded→analyzing→generated→satisfied) |
| `McpJob` / `JobStep` | وظائف MCP↔n8n | `type`, `status`, `inputsJson`, `progress` |
| `CustomAgent` | وكلاء مخصصون | `systemPrompt`, `toolsJson`, `category` |
| `ExternalMcpServer` | خوادم MCP خارجية | `url`, `transport`, `authToken` |
| `SpotifyToken` | OAuth Spotify | `accessToken`, `refreshToken`, `expiresAt` |
| `Reminder` | تذكيرات AI | `taskText`, `remindAt`, `status` |

---

## 2. جميع المميزات الحالية (Current Features)

### 🤝 نظام المحادثة (Chat System)

| الميزة | التفاصيل | الملف |
|---|---|---|
| **بث مباشر (Streaming)** | SSE streaming عبر 12+ مزود | `chat/stream/route.ts` (3,235 سطر) |
| **27 نموذج شات** | GLM-5.2, Claude, Gemini, GPT-4o, Llama, DeepSeek | `lib/models.ts` |
| **محادثة غير مبثوثة** | `generateWithFallback()` بسلسلة fallback | `chat/send/route.ts` (797 سطر) |
| **محادثة صوتية** | STT → LLM → TTS pipeline كامل | `voice/chat/route.ts` |
| **رفع ملفات** | PDF/DOCX/صور/فيديو مع استخراج محتوى | `chat/files/route.ts` |
| **تحليل دفعي** | معالجة 3+ ملفات + إنشاء PDF مجمع | `chat/batch/route.ts` |
| **ساحة النماذج** | مقارنة ردود نموذجين جنباً إلى جنب | `chat/arena/route.ts` |
| **بحث تلقائي** | web search أثناء المحادثة | مدمج في stream route |
| **ذاكرة محادثة** | استخراج معلومات المستخدم تلقائياً | `UserMemory` model |
| **إنجازات وتحديات** | نقاط، مستويات، streak يومي | `Achievement`, `DailyChallenge` |
| **أوامر slash** | 25+ أمر (/صورة، /فيديو، /بحث، /تحليل...) | `ChatInput.tsx` |
| **Intent Detection** | كشف نية المستخدم (quiz، بحث، تحليل) | `lib/intent/` |

### 🎙️ Audio Pipeline (الصوت)

| الميزة | التفاصيل | الملف |
|---|---|---|
| **TTS متعدد المزودين** | ElevenLabs → Edge TTS → Google → StreamElements | `ai/tts/edge/route.ts` |
| **ElevenLabs (رئيسي)** | `eleven_multilingual_v2`, voice George, جودة عالية | مضمن في route |
| **Edge TTS مصري** | `ar-EG-ShakirNeural` / `ar-EG-SalmaNeural` | `lib/edge-tts.ts` |
| **Egyptian HF Space** | `MohamedRashad/Egyptian-Arabic-TTS` (Chatterbox) | عبر @gradio/client |
| **ASR (تحويل الصوت لنص)** | Groq Whisper-large-v3 (رئيسي) + ZAI SDK (fallback) | `ai/asr/route.ts` |
| **Live Voice Chat** | Web Speech API STT → LLM → TTS looping | `hooks/use-audio.ts` (726 سطر) |
| **Voice Chat Race** | 4 مزودين يتسابقون (ZAI/Cerebras/Groq/OpenRouter) | `voice/chat/route.ts` |
| **Barge-in** | مقاطعة الكلام + إعادة الاستماع | `interruptSpeaking()` |
| **Web Audio API** | `decodeAudioData` + `AudioBufferSourceNode` | MessageBubble + use-audio |
| **Base64 JSON Pipeline** | تجاوز إفساد Next.js للـ binary | جميع مسارات TTS |
| **AudioContext Unlock** | resume على أول ضغطة + test beep (440Hz) | `unlockAudioHardware()` |
| **Voice Toggle** | تبديل شاكر ↔ سلمى في الـ live chat | `use-audio.ts` |
| **Voice Benchmark** | مسار قياس أداء الـ pipeline كامل | `ai/voice-benchmark/route.ts` |

### 🎨 توليد المحتوى

| الميزة | التفاصيل |
|---|---|
| **توليد صور** | 13 نموذج (Flux, DALL-E, Seedream, CogView, ZImage) |
| **توليد فيديو** | 7 نماذج HF (CogVideoX, LTX-Video, Wan2.1) |
| **بودكاست** | تحويل المحتوى لصوت + تخزين في DB |
| **راديو** | 5 محطات (قرآن، مصر، وطني، أزهر، hits) |
| **PDF Generation** | توليد PDF/PPTX بالذكاء الاصطناعي |
| **خريطة ذهنية** | توليد خرائط ذهنية تفاعلية |
| **اختبارات (Quiz)** | توليد اختبارات من أي موضوع |
| **ترجمة** | ترجمة نصية بمزامنة تلقائية |

### 🔧 أدوات MCP (340 أداة)

| الفئة | عدد الأدوات | أمثلة |
|---|---|---|
| GitHub | 50+ | repo-stats, issues, pulls, create-release |
| Crypto/Finance | 20+ | coingecko, exchange-rates, stock-price |
| Weather/Space | 20+ | weather, mars-weather, iss-position, space-people |
| Content/AI | 30+ | blog-write, ad-copy, quiz-generate, summarize |
| Documents | 20+ | cv-parser, invoice-parser, pdf-chat, pitch-deck |
| Code | 15+ | code-exec, code-review, sql-generator, regex-tester |
| External APIs | 20+ | slack, telegram, notion, google-sheets, n8n |
| Utilities | 40+ | password-gen, uuid, qr-generate, base64 |
| Research | 20+ | deep-research, web-search, hacker-news, rss |
| Memory/RAG | 10+ | memory, vector-store, rag-citation |

### 🔐 المصادقة والإدارة

| الميزة | التفاصيل |
|---|---|
| **تسجيل/دخول** | بريد إلكتروني + كلمة مرور (bcrypt) |
| **OTP** | رمز تحقق عبر البريد (Brevo/Resend/SMTP) |
| **Google OAuth** | تسجيل دخول بحساب Google |
| **Sessions** | token-based مع expiry |
| **Admin Panel** | إدارة مستخدمين، إعدادات، إحصائيات |
| **API Keys Management** | تخزين آمن لمفاتيح المزودين في AdminSettings |
| **Custom Models** | إضافة نماذج مخصصة (OpenAI-compatible) |
| **System Prompts** | تجاوز system prompts الافتراضية |

### 🏠 تكاملات خارجية

| التكامل | الحالة |
|---|---|
| **Telegram Bot** | poller.ts يعمل في background |
| **WhatsApp Bot** | مسار webhook |
| **Google Drive** | قراءة ملفات العميل (OAuth) |
| **Spotify** | بحث + تشغيل (10 routes) |
| **n8n** | webhook + async jobs |
| **Home Assistant** | (مخطط له — غير مفعول حالياً) |

---

## 3. العيوب والمشاكل الحالية (Issues & Bottlenecks)

### 🚨 حرجة — أمنية

| # | المشكلة | الملف | الخطورة |
|---|---|---|---|
| 1 | **مفتاح Google Service Account مكتوب في الكود** — مفتاح RSA خاص كامل في `google-service-account.json` + `google-drive-credentials.ts` | root + lib/ | 🔴 حرج |
| 2 | **Cloudflare API token مكتوب في الكود** — `EMBEDDED_CF_API_TOKEN` في `cloudflare-ai.ts` | lib/cloudflare-ai.ts | 🔴 حرج |
| 3 | **كلمة مرور admin افتراضية `admin123456`** — fallback في `start.sh` لو لم يضبط `ADMIN_PASSWORD` | start.sh | 🔴 حرج |
| 4 | **SESSION_SECRET مكتوب في الكود** — `EMBEDDED_SESSION_SECRET` في `session-secret.ts` كـ fallback | lib/session-secret.ts | 🔴 حرج |

### ⚠️ عالية — تشغيلية

| # | المشكلة | التأثير |
|---|---|---|
| 5 | **`next dev` بدلاً من `next build`** في الإنتاج — بسبب OOM على 2GB RAM | بطء + استهلاك ذاكرة عالي + no minification |
| 6 | **`typescript.ignoreBuildErrors: true`** | أخطاء TypeScript تمر صامتة للإنتاج |
| 7 | **`prisma db push --accept-data-loss`** | قد يحذف أعمدة/جداول إذا تراجع الـ schema |
| 8 | **`Cerebras` بدون timeout** (`CHAT_TIMEOUT_MS = 0`) | طلبات معلقة بلا نهاية |
| 9 | **`chat/stream/route.ts` بدون `maxDuration`** | قد يُقتل بواسطة HF timeout صامتاً |
| 10 | **حالة in-memory في `voice/chat/route.ts`** | `sessionHistory` Map تُفقد على cold start |

### ⚠️ متوسطة — جودة الكود

| # | المشكلة | التفاصيل |
|---|---|---|
| 11 | **ملف stream route ضخم** | 3,235 سطر في ملف واحد — يجب تقسيمه |
| 12 | **تكرار `GROQ_API_KEY`** | مُصدّر في `groq.ts` و`groq-audio.ts` معاً |
| 13 | **صوت hardcoded في MessageBubble** | يستخدم `ar-EG-SalmaNeural` دائماً بغض النظر عن تفضيل المستخدم |
| 14 | **Rate limiter in-memory** | لا يعمل في multi-instance (Redis متاح لكن غير مستخدم) |
| 15 | **CSP يسمح `unsafe-eval`** | ضعف حماية XSS |
| 16 | **ملفات بحث في الـ repo** | `research/` (60+ JSON), `tool-results/` (50+ ملف) تنتفخ الـ repo |
| 17 | **scripts بدائية في الجذر** | `1783137937502-player-script.js` + 3 ملفات أخرى |
| 18 | **لا توجد اختبارات** | لا Jest/Vitest في الـ app الرئيسي |

---

## 4. خطة تطوير "كرة الذكاء الاصطناعي" (AI Voice Assistant Sphere)

### التكامل المقترح مع الكود الحالي

```
┌─────────────────────────────────────────────────────┐
│              الكرة الذكية (Orange Pi Zero 3)          │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Layer 1: محلي (بدون إنترنت)                        │
│  ├── Vosk STT (Arabic, 50MB) ──→ 200ms             │
│  ├── openWakeWord ("يا آنزارو") ──→ 150ms           │
│  ├── RNNoise (إزالة ضوضاء) ──→ 10ms                │
│  ├── SpeexDSP (AEC) ──→ 5ms                        │
│  ├── Home Assistant + Mosquitto MQTT ──→ 5ms        │
│  └── ChromaDB + all-MiniLM (RAG محلي) ──→ 100ms    │
│                                                     │
│  Layer 2: سحابي (Anzaro AI على HF)                  │
│  ├── POST /api/voice/chat (LLM race) ──→ 700ms     │
│  ├── POST /api/ai/tts/edge (ElevenLabs) ──→ 300ms  │
│  └── WebSocket مستمر (pre-warmed)                   │
│                                                     │
│  إجمالي: ≤1.5 ثانية                                │
└─────────────────────────────────────────────────────┘
```

### ملفات Anzaro AI المستخدمة في الكرة

| ملف Anzaro | دورة في الكرة | التعديل المطلوب |
|---|---|---|
| `api/voice/chat/route.ts` | معالجة LLM للأسئلة المعرفية | إضافة WebSocket mode للاتصال المستمر |
| `api/ai/tts/edge/route.ts` | توليد الصوت (ElevenLabs → Edge TTS) | إضافة streaming chunks للـ TTS |
| `hooks/use-audio.ts` | منطق الـ voice loop | كتابة نسخة Python/Bun للأجهزة |
| `lib/edge-tts.ts` | Edge TTS service | يعمل كما هو على Orange Pi |
| `lib/models.ts` | اختيار النموذج | إضافة mode "sphere" بنموذج سريع |

### كود مقترح للكرة (Python على Orange Pi)

```python
# sphere_main.py — يعمل على Orange Pi Zero 3
import asyncio
import vosk
import json
import websockets
import pyaudio
from rnnoise import RNNoise
import paho.mqtt.client as mqtt

# 1. Wake Word Detection (offline)
async def listen_for_wake_word():
    """يستمع لكلمة 'يا آنزارو' باستخدام openWakeWord"""
    pass

# 2. STT محلي (Vosk — offline)
async def transcribe_speech():
    """يفرّغ الكلام باستخدام Vosk Arabic model"""
    model = vosk.Model("models/vosk-arabic")
    rec = vosk.KaldiRecognizer(model, 16000)
    # يعيد النص في ~200ms
    pass

# 3. إرسال للـ Anzaro AI (سحابي)
async def ask_anzaro(text: str, websocket):
    """يرسل النص لـ Anzaro AI عبر WebSocket"""
    await websocket.send(json.dumps({
        "message": text,
        "sessionId": "sphere_001",
        "model": "glm-5-2",
        "language": "egyptian"
    }))
    response = await websocket.recv()
    return json.loads(response)["content"]

# 4. TTS من Anzaro AI (Base64 JSON)
async def get_tts(text: str):
    """يطلب TTS من /api/ai/tts/edge"""
    async with aiohttp.ClientSession() as session:
        async with session.post(
            "https://kopabdo-delta-ai-v2.hf.space/api/ai/tts/edge",
            json={"text": text, "voice": "ar-EG-SalmaNeural", "speed": 1.1}
        ) as resp:
            data = await resp.json()
            return base64.b64decode(data["audioData"])

# 5. MQTT للتحكم المنزلي (محلي)
def control_home(command: str):
    """يحول أمر صوتي لـ MQTT topic"""
    mqtt_client.publish("home/commands", command)

# 6. RAG محلي (قراءة ملفات Drive)
async def search_documents(query: str):
    """يبحث في ChromaDB المحلي"""
    results = chroma_collection.query(query_texts=[query], n_results=3)
    return results["documents"][0]

# Pipeline الرئيسي
async def main_loop():
    while True:
        await listen_for_wake_word()  # 150ms
        text = await transcribe_speech()  # 200ms
        
        # fork: مسار المعرفة + مسار المنزل (متوازي)
        if is_home_command(text):
            control_home(text)  # 5ms (محلي)
            tts = await get_tts("تمام، اتعمل")
        else:
            context = await search_documents(text)  # 100ms (محلي)
            reply = await ask_anzaro(text + context, ws)  # 700ms (سحابي)
            tts = await get_tts(reply)  # 300ms (سحابي)
        
        play_audio(tts)  # فوري
```

### التعديلات المطلوبة في Anzaro AI للكرة

| التعديل | الملف | الوصف |
|---|---|---|
| **WebSocket endpoint** | جديد `api/voice/ws/route.ts` | اتصال مستمر بدلاً من HTTP per-request |
| **TTS streaming** | `api/ai/tts/edge/route.ts` | إرسال chunks بدلاً من Base64 كامل |
| **Sphere mode** | `lib/models.ts` | نموذج سريع فقط (Llama 3.1 8B) |
| **Intent routing** | `api/voice/chat/route.ts` | كشف أوامر المنزل وتحويلها لـ MQTT |
| **Health check** | جديد `api/voice/health/route.ts` | للكرة للتحقق من حالة السيرفر |

---

## 5. حلول المشاكل واقتراحات سد النواقص (Solutions & Feature Gaps)

### 🔴 حلول المشاكل الحرجة

#### 1. إزالة المفاتيح المكتوبة في الكود

```ts
// قبل (cloudflare-ai.ts):
const EMBEDDED_CF_API_TOKEN = '[REDACTED]DCfAy...';

// بعد:
const CF_API_TOKEN = process.env.CF_API_TOKEN || '';
if (!CF_API_TOKEN) throw new Error('CF_API_TOKEN required');
```

**الإجراء:** تدوير كل المفاتيح المسربة + إزالتها من تاريخ git.

#### 2. إصلاح كلمة مرور Admin

```bash
# start.sh — قبل:
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123456}"

# بعد:
if [ -z "$ADMIN_PASSWORD" ]; then
  echo 'FATAL: ADMIN_PASSWORD not set'
  exit 1
fi
```

#### 3. إصلاح `next dev` في الإنتاج

```bash
# الحل: بناء محلي + رفع .next/ artifact
# على جهاز بـ 8GB+ RAM:
bun run build
# ثم رفع .next/ للـ HF Space
# start.sh:
exec bunx next start -p 3000 -H 0.0.0.0
```

#### 4. تقسيم ملف stream route الضخم

```ts
// بدلاً من ملف واحد بـ 3,235 سطر:
// src/lib/chat/providers/
//   ├── index.ts          (strategy selector)
//   ├── pollinations.ts   (provider handler)
//   ├── groq.ts
//   ├── gemini.ts
//   ├── openrouter.ts
//   └── ... (ملف لكل مزود)

// chat/stream/route.ts:
import { getProviderHandler } from '@/lib/chat/providers';
export async function POST(req) {
  const handler = getProviderHandler(model);
  return handler(req);
}
```

### 🟡 الميزات الناقصة لتصبح منصة عالمية

#### 1. نظام Workspace متعدد المستخدمين

```prisma
model Workspace {
  id          String   @id @default(cuid())
  name        String
  ownerId     String
  members     UserWorkspace[]
  conversations Conversation[]
  createdAt   DateTime @default(now())
}

model UserWorkspace {
  userId      String
  workspaceId String
  role        String   // owner/editor/viewer
}
```

#### 2. بلوجنات/إضافات (Plugin System)

```ts
// src/lib/plugins/registry.ts
interface Plugin {
  name: string;
  type: 'tool' | 'provider' | 'ui';
  execute: (input: any) => Promise<any>;
}
// يسمح للمطورين بإضافة أدوات بدون تعديل الكود الأساسي
```

#### 3. تحليلات للمستخدم (Analytics Dashboard)

- إحصائيات الاستخدام لكل نموذج
- تتبع latency لكل مزود
- رسم بياني للاستهلاك اليومي
- تنبيهات عند تجاوز الحصص

#### 4. وضع الفريق (Team Mode)

- مشاركة المحادثات
- أدوار (admin/member/viewer)
- ميزانية مشتركة للاستهلاك
- سجل النشاط (audit log)

#### 5. API عام (Public API)

```ts
// api/v1/chat/route.ts — API عام للطراف الثالثة
// مع rate limiting صارم + API keys للمطورين
```

#### 6. PWA (Progressive Web App)

- إمكانية التثبيت كتطبيق على الموبايل
- يعمل offline للمحادثات المخزنة
- push notifications

#### 7. دعم متعدد اللغات (i18n)

- تبديل بين العربية/الإنجليزية/الفرنسية
- ترجمة الـ UI بالكامل (ليس فقط المحادثة)

#### 8. أمان متقدم

- 2FA (Two-Factor Authentication)
- Audit log لكل العمليات الحساسة
- تشفير end-to-end للمحادثات الحساسة
- Rate limiting عبر Redis (بدلاً من in-memory)

#### 9. تكامل مع الكرة الذكية

- WebSocket endpoint للاتصال المستمر
- TTS streaming (بدلاً من Base64 كامل)
- Intent routing لأوامر المنزل
- Health check endpoint
- Device management (تسجيل الأجهزة + إدارتها)

#### 10. تحسينات الصوت

- Voice cloning (تدريب صوت مخصص للمستخدم)
- وضع متعدد الأصوات (اختيار من مكتبة أصوات)
- تحكم في السرعة والنبرة
- دعم لغات متعددة في نفس الجلسة

---

## 📋 خطة التنفيذ (أولويات)

| الأولوية | المهمة | المدة |
|---|---|---|
| **P0 فوري** | تدوير المفاتيح المسربة + إزالتها من الكود | اليوم |
| **P0 فوري** | إصلاح كلمة مرور admin الافتراضية | اليوم |
| **P1 هذا الأسبوع** | إصلاح `prisma db push` → `migrate deploy` | 2 ساعة |
| **P1 هذا الأسبوع** | إعادة تفعيل TypeScript checking | 4 ساعة |
| **P2 هذا الشهر** | تقسيم ملف stream route | 3 أيام |
| **P2 هذا الشهر** | Redis لـ rate limiting + session history | 2 يوم |
| **P3 الربع القادم** | Workspace متعدد المستخدمين | أسبوع |
| **P3 الربع القادم** | تكامل الكرة الذكية (WebSocket + TTS streaming) | أسبوع |
| **P4Backlog** | Plugin system + Public API + PWA | حسب الطلب |

---

*تقرير إعداد: Senior Solutions Architect — فحص شامل لمنصة Anzaro AI*
*التاريخ: يوليو 2025 | المستضيف: Hugging Face Spaces | التقنية: Next.js 16 + Bun + Prisma*
