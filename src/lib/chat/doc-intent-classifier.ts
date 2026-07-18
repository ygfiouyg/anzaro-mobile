// ═══════════════════════════════════════════════════════════════════════════
// DeltaAI — Document Intent Classifier (Egyptian Arabic + English)
// ═══════════════════════════════════════════════════════════════════════════
// Classifies user messages into document operation intents using regex
// pattern matching and a scoring system. No LLM calls — this runs on
// every chat message and must be FAST.
//
// Supports Egyptian Arabic colloquial expressions alongside English.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Types ─────────────────────────────────────────────────────────────────

export type DocIntentType =
  | 'extract-topic'    // Extract a specific topic/section from files
  | 'summarize'        // Summarize content
  | 'compile'          // Compile/aggregate multiple files into one
  | 'outline'          // Create a structured outline
  | 'compare'          // Compare across files
  | 'flashcards'       // Generate flashcards
  | 'quiz'             // Generate quiz (delegated to quiz-service, just detect)
  | 'smart-doc'        // General smart document (fallback)
  | 'generate-pptx'    // Generate PowerPoint presentation
  | 'generate-docx'    // Generate Word document
  | 'generate-file'    // Generate a file (format auto-detected)
  | 'chat-only';       // Not a document request, just normal chat

export interface DocIntent {
  type: DocIntentType;
  confidence: number;        // 0-1
  topic?: string;            // Extracted topic (e.g., "عبس", "AI", "الذكاء الاصطناعي")
  scope: 'all' | 'specific'; // All files or specific ones
  format?: 'pdf' | 'text' | 'pptx' | 'docx' | 'all';   // Output format preference
  depth: 'brief' | 'medium' | 'detailed'; // How detailed
  fileHints?: string[];      // Referenced file names
  rawTopic?: string;         // Original topic text before extraction
}

// ─── Internal Types ────────────────────────────────────────────────────────

interface IntentPattern {
  type: DocIntentType;
  patterns: RegExp[];
  weight: number; // Base weight for each matched pattern
}

interface ScoredIntent {
  type: DocIntentType;
  score: number;
  matchedPatterns: number;
}

// ─── Intent Patterns ───────────────────────────────────────────────────────
// Each intent has multiple regex patterns. Egyptian Arabic colloquial forms
// are listed alongside Modern Standard Arabic and English.

const INTENT_PATTERNS: IntentPattern[] = [
  // ── extract-topic ──────────────────────────────────────────────────────
  {
    type: 'extract-topic',
    weight: 3,
    patterns: [
      // Arabic: "استخرجلي جزء X", "طلعلي اللي عن X", "جيبلي كل حاجة عن X"
      /استخرج[لي]*\s*(جزء|قسم|موضوع|فصل|محاضرة)?\s*/i,
      /طلعلي?\s*(اللي\s*عن|اللي\s*خاص|كل\s*حاجة\s*عن|كل\s*حاجة\s*خصوص)/i,
      /جيبلي?\s*(كل\s*حاجة\s*عن|كل\s*شيء\s*عن|اللي\s*عن|جزء|قسم)/i,
      /الجزء\s*بتاع\s*/i,
      /بتاع\s+(القلب|العظام|الغضارف|الاعصاب|الكبد|الرئة|الدم|العضلات|الجلد)/i,
      // "بس" at end = just this part
      /\b(القلب|العظام|الغضارف|الاعصاب|الكبد|الرئة|الدم|العضلات)\s+بس\b/i,
      // English
      /extract\s+(the\s+)?(topic|section|part|chapter|portion)?\s*(of|from|about)?/i,
      /pull\s+(out|up)\s+(the\s+)?(section|part|topic)/i,
      /get\s+(me\s+)?(the\s+)?(section|part|topic)\s*(on|about|for)/i,
      /just\s+(the\s+)?(section|part|topic)\s*(on|about|for)/i,
      // "extract X from" — when X comes directly after extract
      /extract\s+(?!the\s+(?:topic|section|part|chapter))\S/i,
      // "the X section/part" — topic before the word section
      /(?:the\s+)?(\S+)\s+(?:section|part|chapter|topic)\b/i,
      /only\s+(the\s+)?(section|part|topic)\s*(on|about|for)/i,
    ],
  },

  // ── summarize ──────────────────────────────────────────────────────────
  {
    type: 'summarize',
    weight: 3,
    patterns: [
      // Arabic: "لخصلي", "اعمل ملخص", "خليها مختصرة"
      /لخصلي?\s*/i,
      /لخ[صض]\s+(ال)?محاضرات?\s*/i,
      /اعمل\s*(لي?\s*)?ملخص\s*/i,
      /اعمللي?\s*ملخص\s*/i,
      /اعملي\s*ملخص\s*/i,
      /خليه[ا]?م?\s*مختصر[ةه]?\s*/i,
      /اختصر(لي)?\s*/i,
      /ملخص\s*(لل)?محاضرات?\s*/i,
      /لخص\s*كلهم?\s*(في)?\s*/i,
      /لخصلي?\s*كلهم?\s*/i,
      /ملخص\s*(شامل|عام|موجز)/i,
      // ── IMPLICIT summarize → file patterns (no "ملف/pdf" needed) ──
      /لخص\s*(ال)?(قوانين|أحكام|مواد|قانون)/i,
      /ملخص\s*(ال)?(قوانين|أحكام|مواد|قانون)/i,
      /لخص\s*(ال)?(دروس|ملازم|مقرر|منهج|كتاب|مذكرة)/i,
      /ملخص\s*(لل)?(دروس|ملازم|مقرر|منهج|كتاب|مذكرة)/i,
      /اختصر\s*(ال)?(قوانين|أحكام|مواد|دروس|ملازم|مقرر|منهج)/i,
      /لخصلي?\s*(ال)?(قوانين|أحكام|دروس|ملازم|مقرر|منهج)/i,
      // English
      /summarize\s*(the\s+)?(lectures?|files?|content|notes|document|all)?/i,
      /summarize\s+(the\s+)?(laws|rules|regulations|statutes)/i,
      /make\s+(a\s+)?summary\s*(of|for)?/i,
      /give\s+(me\s+)?(a\s+)?summary\s*(of|for)?/i,
      /sum\s*up\s*(the\s+)?(lectures?|files?|content|notes)?/i,
      /brief\s*(overview|summary|recap)\s*(of|for)?/i,
      /recap\s*(the\s+)?(lectures?|files?|content)?/i,
      /short\s*en\s*(it|this|the\s+content)?\s*(down)?/i,
    ],
  },

  // ── compile ────────────────────────────────────────────────────────────
  {
    type: 'compile',
    weight: 3,
    patterns: [
      // Arabic: "اعمل تجميعة", "اجمع كل", "حط كلهم مع بعض", "لمي كل"
      /اعمل\s*(لي?\s*)?تجميع[ةه]\s*/i,
      /تجميع[ةه]\s*(ل)?كل\s*/i,
      /اجمع\s*(كل\s*)?(المحاضرات?|الملفات|المستندات|الملف)/i,
      /حط\s*(كلهم?|الكل)\s*مع\s*بعض\s*/i,
      /لم[يى]?\s*كل\s*(المحاضرات?|الملفات)/i,
      /جم[عى]?\s*(كل\s*)?(المحاضرات?|الملفات)\s*(في|فيه|حط)/i,
      /ضفهم?\s*(كلهم?|بعض)\s*(مع|في)\s*/i,
      /كلهم?\s*(في\s*)?ملف\s*(واحد)?/i,
      /حطهم?\s*كلهم?\s*في\s*/i,
      // ── IMPLICIT compile → file patterns (no "ملف/pdf" needed) ──
      /اجمع\s*(ال)?(قوانين|أحكام|مواد|قانون)/i,
      /تجميع[ةه]?\s*(لل)?(قوانين|أحكام|مواد|قانون)/i,
      /تجميع[ةه]?\s*بكل\s*(ال)?/i,  // "تجميعة بكل القوانين"
      /لم[يى]?\s*(ال)?(قوانين|أحكام|مواد)/i,
      /اجمع\s*(ال)?(دروس|ملازم|مقرر|منهج|كتاب)/i,
      /تجميع[ةه]?\s*(لل)?(محاضرات|دروس|ملازم|مقرر|منهج)/i,
      /لم[يى]?\s*(ال)?(محاضرات|دروس|ملازم)/i,
      // Law/legal specific
      /كل\s*القوانين/i,
      /القوانين\s*(كلها|جميعها|كاملة)/i,
      // "تجميعة كل الكلام اللي في كل المحاضرات" type requests
      /تجميع[ةه]?\s*كل\s*(الكلام|المحتوى|الحاجات|المعلومات|اللي)/i,
      /كل\s*(الكلام|المحتوى|المعلومات)\s*(اللي|في)\s*(كل|جميع)/i,
      // English
      /compile\s*(all\s+)?(lectures?|files?|documents?|notes?)?/i,
      /merge\s*(all\s+)?(lectures?|files?|documents?|notes?)?/i,
      // English implicit
      /compile\s+(the\s+)?(laws|rules|regulations|statutes)/i,
      /gather\s+(all\s+)?(the\s+)?(laws|rules|regulations)/i,
      /all\s+(the\s+)?(laws|rules|regulations)\s*(together|in one|combined)/i,
      /combine\s*(all\s+)?(lectures?|files?|documents?|notes?)?/i,
      /put\s*(them\s+)?(all\s+)?together/i,
      /aggregate\s*(all\s+)?(lectures?|files?|documents?)?/i,
      /gather\s*(all\s+)?(lectures?|files?|documents?|notes?)?/i,
      /consolidate\s*(all\s+)?(lectures?|files?|documents?)?/i,
      /into\s+one\s+(file|document)/i,
    ],
  },

  // ── outline ────────────────────────────────────────────────────────────
  {
    type: 'outline',
    weight: 3,
    patterns: [
      // Arabic: "اعمللي فهرس/خطة", "رتبلي", "اعمل هيكل"
      /اعمل\s*(لي?\s*)?(فهرس|خطة|خطة\s*دراسية|هيكل)\s*/i,
      /اعمللي?\s*(فهرس|خطة|هيكل)\s*/i,
      /رتب(لي)?\s*(المحاضرات?|المحتوى|الملفات)?\s*/i,
      /نظم(لي)?\s*(المحاضرات?|المحتوى|الملفات)?\s*/i,
      /رتبلي?\s*/i,
      /هيكل(ة)?\s*(ل)?(لمحتوى|لمحاضرات)/i,
      /فهرس\s*(ل)?(لمحاضرات|لمحتوى|للملفات)/i,
      /خطة\s*(ل)?(لمذاكرة|للدراسة|للمحتوى)/i,
      // English
      /create\s+(an?\s+)?outline\s*(for|of)?/i,
      /make\s+(an?\s+)?outline\s*(for|of)?/i,
      /build\s+(an?\s+)?outline\s*(for|of)?/i,
      /generate\s+(an?\s+)?outline\s*(for|of)?/i,
      /organize\s*(the\s+)?(lectures?|content|notes|files)/i,
      /structure\s*(the\s+)?(lectures?|content|notes|files)/i,
      /table\s+of\s+contents?\s*(for|of)?/i,
      /study\s+plan\s*(for|from)?/i,
    ],
  },

  // ── compare ────────────────────────────────────────────────────────────
  {
    type: 'compare',
    weight: 4, // Higher weight — compare is very specific
    patterns: [
      // Arabic: "قارن بين", "ايه الفرق بين"
      /قارن?\s*بين\s*/i,
      /مقارن[ةه]?\s*بين\s*/i,
      /اي[هة]?\s*الفرق\s*بين\s*/i,
      /اي[هة]?\s*الفروق\s*بين\s*/i,
      /شوف\s*الفرق\s*بين\s*/i,
      /فرق\s*بين\s*(المحاضرتين|الملفين|المحاضرات)/i,
      /اعمل\s*(لي?\s*)?مقارن[ةه]?\s*(بين)?\s*/i,
      /قارن?\s*(المحاضرة|المحاضرات|الملفات|الملف)/i,
      // English
      /compare\s*(the\s+)?(lectures?|files?|documents?|notes?)?/i,
      /differences?\s*between\s*/i,
      /what('s|\s+is)\s+the\s+difference\s+between/i,
      /contrast\s*(the\s+)?(lectures?|files?|documents?)?/i,
      /compare\s+and\s+contrast/i,
      /vs\.?\s*(between|the)/i,
    ],
  },

  // ── flashcards ─────────────────────────────────────────────────────────
  {
    type: 'flashcards',
    weight: 4, // High weight — flashcards is very specific
    patterns: [
      // Arabic: "اعمل كروت مراجعة", "كروت حفظ"
      /اعمل\s*(لي?\s*)?كروت\s*(مراجع[ةه]|حفظ|ذاكرة|تلخيص)/i,
      /اعمللي?\s*كروت\s*/i,
      /كروت\s*(مراجع[ةه]|حفظ|ذاكرة|تلخيص)/i,
      /بطاقات\s*(مراجع[ةه]|حفظ|ذاكرة|تلخيص)/i,
      /اعمل\s*(لي?\s*)?بطاقات\s*(مراجع[ةه]|حفظ)/i,
      /فلاش\s*كارد/i,
      /فلاش\s*كارت/i,
      // English
      /flash\s*cards?\s*(for|from|about|of)?/i,
      /flashcards?\s*(for|from|about|of)?/i,
      /make\s+flash\s*cards?/i,
      /create\s+flash\s*cards?/i,
      /generate\s+flash\s*cards?/i,
      /study\s+cards?\s*(for|from)?/i,
      /revision\s+cards?\s*(for|from)?/i,
    ],
  },

  // ── quiz ───────────────────────────────────────────────────────────────
  {
    type: 'quiz',
    weight: 4, // High weight — quiz is very specific (handled by quiz-service)
    patterns: [
      // Arabic — reuse patterns from quiz-intent.ts
      /اعمل[ي]?ل?[ي]?\s*(?:لي)?\s*(?:اسئل[هة]|كويز|اختبار)/i,
      /(?:حطلي|جبلي|هاتلي|عطيني|جهزلي|صنعلي|ولدلي|انشئلي)\s*(?:اسئل[هة]|كويز)/i,
      /اختبرن[يى]\s*/i,
      /امتحاني?\s*/i,
      /اسئل[هة]\s*(في|عن|من|على)/i,
      /أسئل[هة]\s*(في|عن|من|على)/i,
      // English
      /quiz\s*me\s*(on|about)?/i,
      /test\s*me\s*(on|about)?/i,
      /generate\s*quiz/i,
      /create\s*quiz/i,
      /make\s*(a\s+)?(quiz|test|questions)/i,
    ],
  },

  // ── smart-doc (general document request) ───────────────────────────────
  {
    type: 'smart-doc',
    weight: 1, // Low weight — fallback when no specific intent matches
    patterns: [
      // /ملفاتي unified command
      /\/ملفاتي/i,
      /ملفاتي/i,
      // Arabic: "اعمل ملف PDF", "طلعلي مستند"
      /اعمل\s*(لي?\s*)?(ملف|مستند| document| pdf)\s*/i,
      /اعمللي?\s*(ملف|مستند| document| pdf)\s*/i,
      /طلع(لي)?\s*(ملف|مستند)\s*/i,
      /ولد(لي)?\s*(ملف|مستند)\s*/i,
      /صنع(لي)?\s*(ملف|مستند)\s*/i,
      /انشئ(لي)?\s*(ملف|مستند)\s*/i,
      /حول(لي)?\s*(ده|دهم|كده|الكلام)\s*(ل|الى)\s*(ملف|pdf|مستند)/i,
      /حفظ(لي)?\s*(الكلام|المحتوى|ده)\s*(في|ك)?\s*(ملف|pdf|مستند)/i,
      /اطبع(لي)?\s*(الكلام|المحتوى|ده)/i,
      // ── IMPLICIT smart-doc patterns (structured output → file) ──
      /ملف\s*شامل/i,
      /مستند\s*شامل/i,
      /تقرير\s*شامل/i,
      /بحث\s*شامل/i,
      /دليل\s*شامل/i,
      /مذكرة\s*(شاملة|كاملة)/i,
      // English
      /make\s+(a\s+)?(document|file|pdf)\s*(from|of|with)?/i,
      /create\s+(a\s+)?(document|file|pdf)\s*(from|of|with)?/i,
      /generate\s+(a\s+)?(document|file|pdf)\s*(from|of|with)?/i,
      /export\s+(as|to)\s+(pdf|document|file)/i,
      /save\s+(as|to)\s+(pdf|document|file)/i,
      /convert\s+(to|into)\s+(pdf|document|file)/i,
      /turn\s+(this|these|it)\s+into\s+(a\s+)?(pdf|document|file)/i,
      /download\s+(as|in)\s+(pdf|document)/i,
    ],
  },

  // ── generate-pptx (PowerPoint presentation) ───────────────────────────
  {
    type: 'generate-pptx',
    weight: 4, // High weight — very specific intent
    patterns: [
      // Arabic: "اعمل باور بوينت", "عرض تقديمي", "بريزنتيشن"
      /اعمل\s*(لي?\s*)?(باور\s*بوينت|بور\s*بوينت|عرض\s*تقديمي|بريزنتيشن|شرائح|بي\s*تك)\s*/i,
      /اعمللي?\s*(باور\s*بوينت|بور\s*بوينت|عرض\s*تقديمي|بريزنتيشن|شرائح)\s*/i,
      /ابغ[يى]\s*(باور\s*بوينت|بور\s*بوينت|عرض\s*تقديمي|بريزنتيشن|شرائح)/i,
      /عايز\s*(باور\s*بوينت|بور\s*بوينت|عرض\s*تقديمي|بريزنتيشن|شرائح)/i,
      /خليني\s*(باور\s*بوينت|بور\s*بوينت|عرض\s*تقديمي|بريزنتيشن|شرائح)/i,
      /صمم?\s*(لي?\s*)?(باور\s*بوينت|بور\s*بوينت|عرض\s*تقديمي|بريزنتيشن|شرائح)/i,
      /ملف\s*(باور\s*بوينت|بور\s*بوينت|pptx?)\s/i,
      /عرض\s*تقديمي\s*(عن|في|بخصوص|حول)/i,
      // English
      /make\s+(a\s+)?(powerpoint|presentation|slides?|pptx?)\s*(about|on|for)?/i,
      /create\s+(a\s+)?(powerpoint|presentation|slides?|pptx?)\s*(about|on|for)?/i,
      /generate\s+(a\s+)?(powerpoint|presentation|slides?|pptx?)\s*(about|on|for)?/i,
      /give\s+me\s+(a\s+)?(powerpoint|presentation|slides?|pptx?)/i,
      /i\s+want\s+(a\s+)?(powerpoint|presentation|slides?|pptx?)/i,
    ],
  },

  // ── generate-docx (Word document) ─────────────────────────────────────
  {
    type: 'generate-docx',
    weight: 4, // High weight — very specific intent
    patterns: [
      // Arabic: "اعمل ملف وورد", "مستند وورد"
      /اعمل\s*(لي?\s*)?(وورد|ورد|ملف\s*وورد|مستند\s*وورد|docx?)\s*/i,
      /اعمللي?\s*(وورد|ورد|ملف\s*وورد|مستند\s*وورد|docx?)\s*/i,
      /ابغ[يى]\s*(وورد|ورد|ملف\s*وورد|مستند\s*وورد|docx?)/i,
      /عايز\s*(وورد|ورد|ملف\s*وورد|مستند\s*وورد|docx?)/i,
      /خليني\s*(وورد|ورد|ملف\s*وورد|مستند\s*وورد|docx?)/i,
      /صمم?\s*(لي?\s*)?(وورد|ورد|ملف\s*وورد|مستند\s*وورد|docx?)/i,
      /ملف\s*(وورد|ورد|docx?)\s/i,
      // English
      /make\s+(a\s+)?(word|docx?)\s*(document|file)?\s*(about|on|for)?/i,
      /create\s+(a\s+)?(word|docx?)\s*(document|file)?\s*(about|on|for)?/i,
      /generate\s+(a\s+)?(word|docx?)\s*(document|file)?\s*(about|on|for)?/i,
      /give\s+me\s+(a\s+)?(word|docx?)\s*(document|file)/i,
      /i\s+want\s+(a\s+)?(word|docx?)\s*(document|file)/i,
    ],
  },

  // ── generate-file (generic file gen with format detection) ────────────
  {
    type: 'generate-file',
    weight: 2, // Medium weight — format will be auto-detected
    patterns: [
      // Arabic: short messages that are just a topic name
      // "عبس" or "أمراض القلب" — single topic, no action verb
      // These are handled by isExplicitFileGen below
    ],
  },
];

// ─── Topic Extraction Patterns ─────────────────────────────────────────────
// These patterns extract the specific topic from the user's message.

const TOPIC_PATTERNS_AR: Array<{ pattern: RegExp; groupIndex: number }> = [
  // "استخرجلي جزء الغضارف" → topic = الغضارف
  { pattern: /استخرج[لي]*\s*جزء\s+(الـ)?(.+?)(?:\s+من|\s+في|\s+عند|$)/i, groupIndex: 2 },
  // "استخرجلي القسم بتاع القلب" → topic = القلب
  { pattern: /استخرج[لي]*\s*(القسم|الجزء|الموضوع|الفصل)\s*(بتاع|الـ)?\s*(.+?)(?:\s+من|\s+في|\s+عند|$)/i, groupIndex: 3 },
  // "طلعلي اللي عن الـ cartilage" → topic = cartilage
  { pattern: /طلعلي?\s*اللي\s*(عن|خاص\s*بـ?)\s*(الـ)?(.+?)(?:\s+من|\s+في|\s+عند|$)/i, groupIndex: 3 },
  // "جيبلي كل حاجة عن العظام" → topic = العظام
  { pattern: /جيبلي?\s*كل\s*(حاجة|شيء)\s*عن\s*(الـ)?(.+?)(?:\s+من|\s+في|\s+عند|$)/i, groupIndex: 3 },
  // "الجزء بتاع القلب بس" → topic = القلب
  { pattern: /الجزء\s*بتاع\s*(الـ)?(.+?)(?:\s+بس|\s+فقط|$)/i, groupIndex: 2 },
  // "القسم بتاع X" → topic = X
  { pattern: /القسم\s*بتاع\s*(الـ)?(.+?)(?:\s+بس|\s+فقط|$)/i, groupIndex: 2 },
  // "كل اللي عن X" → topic = X
  { pattern: /كل\s*اللي\s*(عن|خاص\s*بـ?)\s*(الـ)?(.+?)(?:\s+من|\s+في|\s+عند|$)/i, groupIndex: 3 },
  // "عن الغضارف" → topic = الغضارف (generic "about X" at end of sentence)
  { pattern: /عن\s*(الـ)?(.+?)\s*(?:من|في|عند|بس|فقط|$)/i, groupIndex: 2 },
  // "في موضوع X" → topic = X
  { pattern: /في\s*موضوع\s*(الـ)?(.+?)(?:\s+من|\s+في|$)/i, groupIndex: 2 },
  // "لخصلي المحاضرات عن X" → topic = X
  { pattern: /(?:لخص|ملخص|اختصر).*?عن\s*(الـ)?(.+?)\s*(?:من|في|عند|$)/i, groupIndex: 2 },
  // "لخصلي جزء الغضارف" → topic = الغضارف (summarize + specific part)
  { pattern: /(?:لخص|ملخص|اختصر).*?جزء\s+(الـ)?(.+?)(?:\s+من|\s+في|\s+عند|$)/i, groupIndex: 2 },
  // "لخصلي الجزء بتاع الغضارف" → topic = الغضارف
  { pattern: /(?:لخص|ملخص|اختصر).*?(?:الجزء|القسم)\s*بتاع\s*(الـ)?(.+?)(?:\s+من|\s+في|\s+بس|$)/i, groupIndex: 2 },
];

const TOPIC_PATTERNS_EN: Array<{ pattern: RegExp; groupIndex: number }> = [
  // "extract the cartilage section" → topic = cartilage
  { pattern: /extract\s+(?:the\s+)?(?:topic|section|part|chapter|portion)\s*(?:on|about|for|of)\s+(.+?)(?:\s+from|\s+in|$)/i, groupIndex: 1 },
  // "extract the heart section from the lectures" → topic = heart
  { pattern: /extract\s+(?:the\s+)?(\w+(?:\s+\w+)?)\s+(?:section|part|chapter|topic|portion)(?:\s+from|\s+in|$)/i, groupIndex: 1 },
  // "the section on cartilage" → topic = cartilage
  { pattern: /(?:the\s+)?(?:section|part|topic|chapter)\s*(?:on|about|for)\s+(.+?)(?:\s+from|\s+in|$)/i, groupIndex: 1 },
  // "everything about cartilage" → topic = cartilage
  { pattern: /(?:everything|all)\s*(?:about|on|regarding)\s+(.+?)(?:\s+from|\s+in|$)/i, groupIndex: 1 },
  // "just the part about X" → topic = X
  { pattern: /(?:just|only)\s+(?:the\s+)?(?:part|section)?\s*(?:about|on|for)\s+(.+?)(?:\s+from|\s+in|$)/i, groupIndex: 1 },
  // "about X" at end of summarize/extract patterns → topic = X
  { pattern: /(?:about|on|regarding)\s+(.+?)(?:\s+from|\s+in|$)/i, groupIndex: 1 },
  // "the heart section" → topic = heart (topic before the word section)
  { pattern: /(?:the\s+)?(\w+(?:\s+\w+)?)\s+(?:section|part|chapter|topic|portion)\b/i, groupIndex: 1 },
];

// ─── Depth Detection Patterns ──────────────────────────────────────────────

const DEPTH_PATTERNS: {
  depth: 'brief' | 'medium' | 'detailed';
  patterns: RegExp[];
}[] = [
  {
    depth: 'brief',
    patterns: [
      // Arabic
      /\bمختصر[ةه]?\b/i,
      /\bإيجازي[ةه]?\b/i,
      /\bإيجاز\b/i,
      /\bبإيجاز\b/i,
      /\bباختصار\b/i,
      /\bصغير[ةه]?\b/i,
      /\bفي صفحة واحدة\b/i,
      /\bصفحة واحدة\b/i,
      /\bنقطتين\b/i,
      /\bنقاط\b/i,
      /\bبس\b/i,  // "بس" = just/only (colloquial)
      /\bفقط\b/i,
      // English
      /\bbrief\b/i,
      /\bshort\b/i,
      /\bconcise\b/i,
      /\bquick\s*(summary|overview|recap)?\b/i,
      /\bin\s+(a\s+)?(few|one|two|three)\s+(words?|lines?|sentences?|paragraphs?|pages?)\b/i,
      /\bskim\b/i,
      /\bhigh\s*level\b/i,
      /\btl;?dr\b/i,
      /\bsummary\s*(only|just)\b/i,
    ],
  },
  {
    depth: 'detailed',
    patterns: [
      // Arabic
      /\bمفصل[ةه]?\b/i,
      /\bتفصيلي[ةه]?\b/i,
      /\bتفصيل\b/i,
      /\bبالتفصيل\b/i,
      /\bشامل[ةه]?\b/i,
      /\bبالتفصيل\s*الممل\b/i,
      /\bموسع[ةه]?\b/i,
      /\bعميق[ةه]?\b/i,
      /\bبالعمق\b/i,
      /\bكل\s*التفاصيل\b/i,
      /\bمفصل\s*أوي\b/i,
      // English
      /\bdetailed\b/i,
      /\bcomprehensive\b/i,
      /\bin\s*depth\b/i,
      /\bthorough\b/i,
      /\belaborate\b/i,
      /\bexhaustive\b/i,
      /\bextensive\b/i,
      /\bfull\s*(detail|explanation|coverage|description)/i,
      /\beverything\s*(about|on)/i,
      /\ball\s*(the\s+)?details?\b/i,
      /\bstep\s*by\s*step\b/i,
    ],
  },
];

// ─── Scope Detection Patterns ──────────────────────────────────────────────

const SCOPE_ALL_PATTERNS: RegExp[] = [
  // Arabic
  /\bكل\b/i,
  /\bكلهم?\b/i,
  /\bكلهم?\b/i,
  /\bجميع\b/i,
  /\bكلكم\b/i,
  /\bالكل\b/i,
  /\bكامل[ةه]?\b/i,
  /\bالمحاضرات\b/i, // plural = all
  /\bالملفات\b/i,
  // English
  /\ball\b/i,
  /\bevery\b/i,
  /\beverything\b/i,
  /\bentire\b/i,
  /\bwhole\b/i,
  /\bcomplete\b/i,
  /\b(?:all\s+)?(?:lectures|files|documents|notes)\b/i,
];

// ─── Format Detection Patterns ─────────────────────────────────────────────

const FORMAT_PATTERNS: { format: 'pdf' | 'text' | 'pptx' | 'docx' | 'all'; patterns: RegExp[] }[] = [
  {
    format: 'pptx',
    patterns: [
      /\bpptx?\b/i,
      /باور\s*بوينت/i,
      /بور\s*بوينت/i,
      /عرض\s*تقديمي/i,
      /عروض\s*تقديمية/i,
      /بريزنتيشن/i,
      /شرائح/i,
      /بي\s*تك/i,
      /\bpowerpoint\b/i,
      /\bpresentation\b/i,
      /\bslides?\b/i,
      /\bslide\s*deck\b/i,
      /\bslideshow\b/i,
    ],
  },
  {
    format: 'docx',
    patterns: [
      /\bdocx?\b/i,
      /وورد/i,
      /ملف\s*وورد/i,
      /مستند\s*وورد/i,
      /\bword\s*(document|file)?\b/i,
    ],
  },
  {
    format: 'pdf',
    patterns: [
      /\bpdf\b/i,
      /\bبي\s*دي\s*إف\b/i,
      /ملف\s*pdf/i,
      /\bP\s*D\s*F\b/i,
      /\bبيدف\b/i,
    ],
  },
  {
    format: 'all',
    patterns: [
      /كل\s*(الصيغ|الأنواع|الملفات|المستندات)/i,
      /\ball\s*(formats?|types?|files?|documents?)\b/i,
      /وباقي\s*(الصيغ|الأنواع)/i,
      /الكل/i,
    ],
  },
  {
    format: 'text',
    patterns: [
      /\btext\b/i,
      /\btxt\b/i,
      /\bنص\b/i,
      /\bمستند\s*نصي/i,
      /\bmarkdown\b/i,
      /\bmd\b/i,
    ],
  },
];

// ─── File Hint Extraction ──────────────────────────────────────────────────
// Extracts referenced file names from the message.

const FILE_HINT_PATTERNS: RegExp[] = [
  // Arabic: "المحاضرة الأولى", "المحاضرة 1", "محاضرة ٢"
  /المحاضرة\s*(الأولى|الثانية|الثالثة|الرابعة|الخامسة|السادسة)/i,
  /المحاضرة\s*(\d+)/i,
  /محاضرة\s*(\d+)/i,
  /محاضرة\s*(الأولى|الثانية|الثالثة)/i,
  // "الملف الأول", "الملف 2"
  /الملف\s*(الأول|الثاني|الثالث|الرابع)/i,
  /الملف\s*(\d+)/i,
  // English: "lecture 1", "file 2", "first lecture"
  /lecture\s*(\d+)/i,
  /file\s*(\d+)/i,
  /(first|second|third|fourth|fifth|1st|2nd|3rd)\s+lecture/i,
  /(first|second|third|1st|2nd|3rd)\s+file/i,
  // Specific file extensions referenced
  /(\S+\.(pdf|docx?|txt|pptx?))/i,
];

// ─── Negative Patterns ─────────────────────────────────────────────────────
// Patterns that indicate the message is NOT a document request.

const NEGATIVE_PATTERNS: RegExp[] = [
  // Pure questions (no action verb)
  /^هل\s/i,
  /^ما\s/i,
  /^من\s/i,
  /^اين\s/i,
  /^كيف\s/i,
  /^ليه\s/i,
  /^امتى\s/i,
  /^إمتى\s/i,
  /^ايه\s+رأيك/i,
  /^ازاي\s/i,
  /^عاملة\s+ايه/i,
  /^what\s+is/i,
  /^who\s+is/i,
  /^where\s+is/i,
  /^how\s+(do|does|can|to)/i,
  /^why\s+(is|do|does|are)/i,
  /^when\s+(is|do|does|was)/i,
  /^can\s+you\s+(explain|tell|describe)/i,
  /^could\s+you\s+(explain|tell|describe)/i,
  // Very short messages unlikely to be document requests
  /^(شكراً?|thanks?|ok|تم|طيب|اه|لا|نعم|yes|no|good|great|fine)\s*$/i,
];

// ─── Implicit File Generation Patterns ─────────────────────────────────────
// These patterns detect when the user's request IMPLIES file generation,
// even without explicit keywords like "ملف" or "pdf".
// Examples: "لخص القوانين", "اجمع المحاضرات", "شامل للقوانين"
// The system should auto-generate a file for these requests.

const IMPLICIT_FILE_GEN_PATTERNS: RegExp[] = [
  // ── Summarize + implies structured output ──
  /لخص(لي)?\s*(ال)?(قوانين|محاضرات|دروس|ملازم|مقرر|منهج|كتاب|مذكرة)/i,
  /ملخص\s*(لل)?(قوانين|محاضرات|دروس|ملازم|مقرر|منهج|كتاب|مذكرة)/i,
  /اعمل\s*(لي?\s*)?ملخص\s*(لل)?(قوانين|محاضرات|دروس|ملازم|مقرر|منهج)/i,
  /اختصر(لي)?\s*(ال)?(قوانين|محاضرات|دروس|ملازم|مقرر|منهج)/i,
  // ── Compile/aggregate + implies structured output ──
  /اجمع\s*(ال)?(قوانين|محاضرات|دروس|ملازم|مقرر|منهج|أحكام|مواد)/i,
  /جم[عى]?\s*(كل)?\s*(ال)?(قوانين|محاضرات|دروس|ملازم|أحكام|مواد)/i,
  /تجميع[ةه]?\s*(لل)?(قوانين|محاضرات|دروس|ملازم|أحكام|مواد)/i,
  /لم[يى]?\s*(ال)?(قوانين|محاضرات|دروس|ملازم|أحكام|مواد)/i,
  // ── Law/legal compilation (very common use case) ──
  /تجميع[ةه]?\s*(ال)?قوانين/i,
  /ملخص\s*(ال)?قوانين/i,
  /شامل\s*(لل)?(قوانين|أحكام|مواد|قانون)/i,
  /دليل\s*(شامل|كامل)\s*(لل)?(قوانين|أحكام|قانون)/i,
  /كل\s*القوانين/i,
  /القوانين\s*(كلها|جميعها|كاملة)/i,
  // ── Study material compilation ──
  /خليهم?\s*(في|ك)\s*(ملف|مستند|حاجة واحدة)/i,
  /حطهم?\s*(كلهم?|بعض)\s*(في|مع)/i,
  /كلهم?\s*(في|ك)\s*(ملف|حاجة|واحد)/i,
  /نظمهم?\s*(في|ك)\s*(ملف|مستند)/i,
  // ── "شامل" (comprehensive) implies structured output ──
  /ملف\s*شامل/i,
  /مستند\s*شامل/i,
  /تقرير\s*شامل/i,
  /بحث\s*شامل/i,
  /دليل\s*شامل/i,
  // ── English implicit patterns ──
  /summarize\s+(the\s+)?(laws|lectures|notes|chapters|rules|regulations|statutes)/i,
  /summary\s+(of|for)\s+(the\s+)?(laws|lectures|notes|chapters|rules|regulations)/i,
  /compile\s+(the\s+)?(laws|lectures|notes|chapters|rules|regulations)/i,
  /comprehensive\s+(summary|guide|review|document|report)\s*(of|for)?/i,
  /all\s+(the\s+)?(laws|rules|regulations|lectures|notes)\s*(together|in one|combined)/i,
  /put\s+(them\s+)?(all\s+)?(in\s+a\s+)?(file|document|one)/i,
  /organize\s+(them\s+)?(into|in)\s+(a\s+)?(file|document)/i,
];

// ─── Explicit File Generation Patterns ─────────────────────────────────────
// When hasAttachments is false, we only classify if the message explicitly
// mentions file generation.

const EXPLICIT_FILE_GEN_PATTERNS: RegExp[] = [
  // Arabic — explicit file/document generation requests
  /اعمل\s*(لي?\s*)?ملف\s*(pdf|PDF|مستند)/i,
  /اعمللي?\s*ملف\s*/i,
  /اعمل\s*(لي?\s*)?(pdf|PDF)\s*/i,  // "اعمل pdf عن صيدلة"
  /اعملي?\s*(لي?\s*)?(pdf|PDF)\s*(عن|في|ل)?/i,  // "اعملي pdf عن كذا"
  /طلع(لي)?\s*ملف\s*/i,
  /طلع(لي)?\s*(pdf|PDF)\s*/i,  // "طلعلي pdf"
  /انشئ(لي)?\s*(ملف|مستند)\s*/i,
  /انشئ(لي)?\s*(pdf|PDF)\s*/i,  // "انشئلي pdf"
  /اعمل\s*(لي?\s*)?ملف\s*(عن|في|ل)/i,  // "اعمل ملف عن صيدلة" — without "pdf"
  /حول.*?(ل|الى)\s*(ملف|pdf|PDF)/i,
  /حفظ.*?(في|ك)\s*(ملف|pdf|PDF)/i,
  /ملف\s*(pdf|PDF)\s*(عن|في|ل)/i,  // "ملف pdf عن صيدلة"
  /(pdf|PDF)\s*(عن|في)\s*/i,  // "pdf عن صيدلة" — very common pattern
  /اعمل\s*(لي?\s*)?(مذكرة|ملخص|تجميعة|بحث)\s*/i,  // "اعمل مذكرة/ملخص/تجميعة"
  /اكتب\s*(لي?\s*)?(بحث|مقال|تقرير|مذكرة)\s*/i,  // "اكتب بحث/مقال"
  // Arabic — PPTX/PowerPoint requests
  /اعمل\s*(لي?\s*)?(باور\s*بوينت|بور\s*بوينت|عرض\s*تقديمي|بريزنتيشن|شرائح)\s*/i,
  /اعمللي?\s*(باور\s*بوينت|بور\s*بوينت|عرض\s*تقديمي|بريزنتيشن|شرائح)\s*/i,
  /ابغ[يى]\s*(باور\s*بوينت|عرض\s*تقديمي|pptx?|وورد|docx?)/i,
  /عايز\s*(باور\s*بوينت|عرض\s*تقديمي|pptx?|وورد|docx?)/i,
  /ممكن\s*(باور\s*بوينت|عرض\s*تقديمي|pptx?|وورد|docx?|pdf)\s/i,
  /خليني\s*(باور\s*بوينت|عرض\s*تقديمي|pptx?|وورد|docx?)/i,
  /عرض\s*تقديمي\s*(عن|في|بخصوص|حول)/i,
  // Arabic — DOCX/Word requests
  /اعمل\s*(لي?\s*)?(وورد|ورد|ملف\s*وورد|مستند\s*وورد|docx?)\s*/i,
  /اعمللي?\s*(وورد|ورد|ملف\s*وورد|مستند\s*وورد|docx?)\s*/i,
  /ملف\s*(وورد|ورد|pptx?|docx?)\s*(عن|في|ل)/i,
  // English
  /generate\s+(a\s+)?(document|file|pdf|powerpoint|presentation|slides?|pptx?|word|docx?)/i,
  /create\s+(a\s+)?(document|file|pdf|powerpoint|presentation|slides?|pptx?|word|docx?)/i,
  /make\s+(a\s+)?(document|file|pdf|powerpoint|presentation|slides?|pptx?|word|docx?)/i,
  /export\s+(as|to)\s+(pdf|document|pptx?|docx?)/i,
  /convert\s+(to|into)\s+(pdf|document|pptx?|docx?)/i,
  /save\s+(as|to)\s+(pdf|document|pptx?|docx?)/i,
  /download\s+(as|in)\s+(pdf|document|pptx?|docx?)/i,
  /pdf\s+(about|on|for)\s+/i,  // "pdf about pharmacy"
  /presentation\s+(about|on|for)\s+/i,  // "presentation about AI"
  /slides?\s+(about|on|for)\s+/i,  // "slides about marketing"
  /pptx?\s+(about|on|for)\s+/i,  // "pptx about topic"
];

// ─── Helper Functions ──────────────────────────────────────────────────────

/**
 * Extract the topic from the user message using regex patterns.
 * Returns both the cleaned topic and the raw (original) topic text.
 */
function extractTopic(message: string): { topic: string; rawTopic: string } | null {
  const trimmed = message.trim();

  // Try Arabic patterns first
  for (const { pattern, groupIndex } of TOPIC_PATTERNS_AR) {
    const match = trimmed.match(pattern);
    if (match && match[groupIndex]) {
      const rawTopic = match[groupIndex].trim();
      const topic = cleanTopic(rawTopic);
      if (topic.length > 0) {
        return { topic, rawTopic };
      }
    }
  }

  // Then English patterns
  for (const { pattern, groupIndex } of TOPIC_PATTERNS_EN) {
    const match = trimmed.match(pattern);
    if (match && match[groupIndex]) {
      const rawTopic = match[groupIndex].trim();
      const topic = cleanTopic(rawTopic);
      if (topic.length > 0) {
        return { topic, rawTopic };
      }
    }
  }

  return null;
}

/**
 * Clean up extracted topic text — remove common prefixes/suffixes.
 */
function cleanTopic(raw: string): string {
  return raw
    // Remove trailing Arabic filler words (بس=only, فقط=only, ده=this, etc.)
    .replace(/\s+(بس|فقط|ده|دا|دي|بتاع|اللي|تاني|كمان)\s*$/, '')
    // Remove leading filler words
    .replace(/^(اللي|عن|من|في|على|بتاع)\s+/, '')
    // Remove trailing prepositions
    .replace(/\s+(من|في|عند|على|الى|إلى)\s*$/, '')
    // Remove "الـ" prefix to normalize (but keep original in rawTopic)
    .trim();
}

/**
 * Extract topic from compile-intent messages.
 * Specialized for phrases like:
 *   "تجميعة بكل القوانين" → "قوانين"
 *   "اجمع كل القوانين" → "قوانين"
 *   "تجميعة قوانين المنهج" → "قوانين المنهج"
 *   "compile all the laws" → "laws"
 */
function extractCompileTopic(message: string): string | null {
  const trimmed = message.trim();

  // Arabic compile-specific topic patterns
  const compileTopicPatternsAr: { pattern: RegExp; groupIndex: number }[] = [
    // "تجميعة بكل القوانين" → "قوانين"
    { pattern: /تجميع[ةه]?\s*بكل\s*(ال)?(.+?)(?:\s+من|\s+في|\s+على|\s*$)/i, groupIndex: 2 },
    // "تجميعة (لل)قوانين" → "قوانين"
    { pattern: /تجميع[ةه]?\s*(لل)?(قوانين|أحكام|مواد|قانون|محاضرات|دروس|ملازم|مقرر|منهج)(?:\s|$)/i, groupIndex: 2 },
    // "اجمع (ال)قوانين" → "قوانين"
    { pattern: /اجمع\s*(ال)?(قوانين|أحكام|مواد|قانون|محاضرات|دروس|ملازم|مقرر|منهج)(?:\s|$)/i, groupIndex: 2 },
    // "كل القوانين" → "قوانين"
    { pattern: /كل\s*(ال)?(قوانين|أحكام|مواد|قانون|محاضرات|دروس)(?:\s|$)/i, groupIndex: 2 },
    // "القوانين كلها/كاملة" → "قوانين"
    { pattern: /(ال)?(قوانين|أحكام|مواد|قانون)\s*(كلها|جميعها|كاملة)/i, groupIndex: 2 },
  ];

  // English compile-specific topic patterns
  const compileTopicPatternsEn: { pattern: RegExp; groupIndex: number }[] = [
    // "compile all the laws" → "laws"
    { pattern: /compile\s+(all\s+)?(?:the\s+)?(laws|rules|regulations|statutes|lectures|notes)/i, groupIndex: 2 },
    // "all the laws" → "laws"
    { pattern: /all\s+(?:the\s+)?(laws|rules|regulations|lectures|notes)\s*(?:together|in one|combined|into)/i, groupIndex: 1 },
    // "gather the laws" → "laws"
    { pattern: /gather\s+(?:all\s+)?(?:the\s+)?(laws|rules|regulations)/i, groupIndex: 1 },
  ];

  // Try Arabic patterns first
  for (const { pattern, groupIndex } of compileTopicPatternsAr) {
    const match = trimmed.match(pattern);
    if (match && match[groupIndex]) {
      return cleanTopic(match[groupIndex].trim());
    }
  }

  // Then English patterns
  for (const { pattern, groupIndex } of compileTopicPatternsEn) {
    const match = trimmed.match(pattern);
    if (match && match[groupIndex]) {
      return cleanTopic(match[groupIndex].trim());
    }
  }

  return null;
}

/**
 * Detect depth level from the message.
 */
function detectDepth(message: string): 'brief' | 'medium' | 'detailed' {
  for (const { depth, patterns } of DEPTH_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(message)) {
        return depth;
      }
    }
  }
  return 'medium';
}

/**
 * Detect scope (all files vs specific).
 */
function detectScope(message: string): 'all' | 'specific' {
  for (const pattern of SCOPE_ALL_PATTERNS) {
    if (pattern.test(message)) {
      return 'all';
    }
  }
  // If file hints are present, it's specific
  const fileHints = extractFileHints(message);
  if (fileHints.length > 0) {
    return 'specific';
  }
  return 'specific'; // Default to specific when no "all" keyword
}

/**
 * Detect output format preference.
 */
function detectFormat(message: string): 'pdf' | 'text' | 'pptx' | 'docx' | 'all' | undefined {
  for (const { format, patterns } of FORMAT_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(message)) {
        return format;
      }
    }
  }
  return undefined;
}

/**
 * Extract file name hints from the message.
 */
function extractFileHints(message: string): string[] {
  const hints: string[] = [];

  for (const pattern of FILE_HINT_PATTERNS) {
    const match = message.match(pattern);
    if (match) {
      // Use the full match as the hint
      hints.push(match[0].trim());
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  return hints.filter(h => {
    if (seen.has(h)) return false;
    seen.add(h);
    return true;
  });
}

/**
 * Extract topic from a file generation message.
 * "اعمل باور بوينت عن عبس" → "عبس"
 * "make a presentation about AI" → "AI"
 * "عمللي pdf عن الذكاء الاصطناعي" → "الذكاء الاصطناعي"
 */
function extractGenTopic(message: string): string | null {
  // Try Arabic prepositions first (most specific)
  const arPrepMatch = message.match(/(?:عن|بخصوص|بشأن|حول)\s+(.+)$/i);
  if (arPrepMatch) {
    return arPrepMatch[1].trim();
  }

  // Try English prepositions
  const enPrepMatch = message.match(/(?:about|on|regarding|concerning|for)\s+(.+)$/i);
  if (enPrepMatch) {
    return enPrepMatch[1].trim();
  }

  // Try Arabic "في" only if there's an action verb before it
  const actionVerbRegex = /(?:اعمل|عمل|ابغ[يى]|عايز|خليني|صمم|انشئ|ممكن|اريد|أريد)\s/i;
  if (actionVerbRegex.test(message)) {
    const fiMatch = message.match(/في\s+(.+)$/i);
    if (fiMatch) {
      return fiMatch[1].trim();
    }
  }

  // Fallback: remove action verbs, format keywords, and common words
  let cleaned = message;
  // Remove action verbs
  const verbs = [
    'اعمللي', 'اعمل لي', 'اعمل', 'عمللي', 'عمل لي', 'عمل',
    'ابغي', 'ابغى', 'ابي', 'ابى',
    'خليني', 'خليك', 'سوي',
    'انشئ', 'أنشئ', 'ولد', 'طلع', 'صمم',
    'اعطني', 'أعطني', 'عطني',
    'عايز', 'عاوزه', 'محتاج',
    'ممكن', 'اريد', 'أريد', 'ودي',
    'انا عايز', 'أنا عايز',
    'make', 'create', 'generate', 'build', 'produce',
    'give me', 'i want', 'i need', 'can you', 'please',
    'design', 'write', 'draft', 'prepare',
  ];
  for (const verb of verbs.sort((a, b) => b.length - a.length)) {
    if (cleaned.toLowerCase().startsWith(verb)) {
      cleaned = cleaned.substring(verb.length).trim();
      break;
    }
  }

  // Remove format keywords
  const formatWords = [
    'باور بوينت', 'باوربوينت', 'بور بوينت', 'بوربوينت',
    'عرض تقديمي', 'عروض تقديمية', 'بريزنتيشن', 'شرائح', 'بي تك',
    'وورد', 'ورد', 'ملف وورد', 'مستند وورد',
    'ملف', 'مستند', 'عرض',
    'powerpoint', 'presentation', 'slides', 'slide deck',
    'word', 'document', 'file', 'pdf', 'pptx', 'ppt', 'docx', 'doc',
  ];
  for (const word of formatWords.sort((a, b) => b.length - a.length)) {
    cleaned = cleaned.replace(new RegExp(word, 'gi'), '').trim();
  }

  // Remove leftover prepositions at start
  const preps = ['عن', 'في', 'من', 'ب', 'ل', 'about', 'on', 'of', 'for'];
  for (const prep of preps) {
    if (cleaned.startsWith(prep + ' ') && cleaned.length > prep.length + 1) {
      cleaned = cleaned.substring(prep.length).trim();
    }
  }

  // Remove filler words
  const fillers = ['لي', 'ليه', 'بقى', 'يا', 'لو سمحت', 'please', 'pls'];
  const words = cleaned.split(/\s+/).filter(w => !fillers.includes(w));
  cleaned = words.join(' ').trim();

  return cleaned || null;
}

/**
 * Check if the message matches any negative pattern (definitely not a doc request).
 */
function isNegativeMessage(message: string): boolean {
  const trimmed = message.trim();
  for (const pattern of NEGATIVE_PATTERNS) {
    if (pattern.test(trimmed)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if the message explicitly mentions file generation.
 */
function isExplicitFileGen(message: string): boolean {
  for (const pattern of EXPLICIT_FILE_GEN_PATTERNS) {
    if (pattern.test(message)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if the message implicitly implies file generation.
 * These are requests where the structured output naturally implies a file
 * (e.g., "لخص القوانين" → summarizing laws implies a structured document).
 */
function isImplicitFileGen(message: string): boolean {
  for (const pattern of IMPLICIT_FILE_GEN_PATTERNS) {
    if (pattern.test(message)) {
      return true;
    }
  }
  return false;
}

// ─── Main Classifier ───────────────────────────────────────────────────────

/**
 * Classify a user message into a document operation intent.
 *
 * This function is FAST — it uses only regex matching and a scoring system,
 * no LLM calls. It runs on every chat message.
 *
 * @param message - The user's chat message
 * @param hasAttachments - Whether there are files attached to the message
 * @returns DocIntent if a document intent is detected, null for normal chat
 */
export function classifyDocIntent(
  message: string,
  hasAttachments: boolean
): DocIntent | null {
  const trimmed = message.trim();

  // Skip empty or very short messages
  if (trimmed.length < 4) return null;

  // Check negative patterns — clearly not a document request
  if (isNegativeMessage(trimmed)) return null;

  // When no attachments, classify if the message explicitly mentions
  // file generation (e.g., "اعمل ملف PDF") OR implicitly implies it
  // (e.g., "لخص القوانين", "اجمع المحاضرات" — structured output → file)
  if (!hasAttachments && !isExplicitFileGen(trimmed) && !isImplicitFileGen(trimmed)) {
    return null;
  }

  // ── Score each intent type ────────────────────────────────────────────
  const scores: ScoredIntent[] = [];

  for (const intentDef of INTENT_PATTERNS) {
    let totalScore = 0;
    let matchedCount = 0;

    for (const pattern of intentDef.patterns) {
      if (pattern.test(trimmed)) {
        totalScore += intentDef.weight;
        matchedCount++;
      }
    }

    if (matchedCount > 0) {
      scores.push({
        type: intentDef.type,
        score: totalScore,
        matchedPatterns: matchedCount,
      });
    }
  }

  // No intent matched at all
  if (scores.length === 0) {
    return null;
  }

  // Sort by score descending, then by matched patterns count
  scores.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.matchedPatterns - a.matchedPatterns;
  });

  const bestMatch = scores[0];
  const secondBest = scores[1];

  // ── Calculate confidence ──────────────────────────────────────────────
  let confidence: number;

  if (bestMatch.score >= 8) {
    confidence = 0.95;
  } else if (bestMatch.score >= 6) {
    confidence = 0.85;
  } else if (bestMatch.score >= 4) {
    confidence = 0.75;
  } else if (bestMatch.score >= 3) {
    confidence = 0.65;
  } else {
    confidence = 0.5;
  }

  // Reduce confidence if second-best is close
  if (secondBest && secondBest.score >= bestMatch.score * 0.7) {
    confidence = Math.max(0.3, confidence - 0.2);
  }

  // ── Determine the intent type ─────────────────────────────────────────
  // Special handling for quiz: if quiz is detected, always use quiz type
  // even if another type scored higher (quiz-service handles it separately)
  let intentType = bestMatch.type;

  // If the top match is smart-doc but quiz also matched, prefer quiz
  if (intentType === 'smart-doc') {
    const quizScore = scores.find(s => s.type === 'quiz');
    if (quizScore && quizScore.score >= 3) {
      intentType = 'quiz';
    }
  }

  // ── Build the result ──────────────────────────────────────────────────
  const result: DocIntent = {
    type: intentType,
    confidence,
    scope: detectScope(trimmed),
    depth: detectDepth(trimmed),
  };

  // ── Priority override: "لخص جزء X" or "لخصلي اللي عن X" → extract-topic ──
  // When a user says "summarize the part about X", they really want to extract X, not summarize everything
  if (intentType === 'summarize') {
    if (/جزء|قسم|بتاع|اللي\s*(عن|خاص)|عن\s+(الـ)?\S/.test(trimmed)) {
      intentType = 'extract-topic';
      result.type = 'extract-topic';
      result.confidence = Math.min(result.confidence + 0.1, 1.0);
    }
  }

  // ── Priority override: "ملف شامل" or "PDF شامل" → compile ──
  // "شامل" (comprehensive) means the user wants everything compiled together
  if (intentType === 'smart-doc' && /شامل/.test(trimmed)) {
    intentType = 'compile';
    result.type = 'compile';
    result.confidence = Math.min(result.confidence + 0.15, 1.0);
  }

  // Extract topic for relevant intent types
  // compile is included because "تجميعة قوانين" → topic = "قوانين"
  if (intentType === 'extract-topic' || intentType === 'summarize' || intentType === 'outline' || intentType === 'compile') {
    const topicResult = extractTopic(trimmed);
    if (topicResult) {
      result.topic = topicResult.topic;
      result.rawTopic = topicResult.rawTopic;
    } else if (intentType === 'compile') {
      // Fallback: try to extract topic from compile-specific patterns
      const compileTopic = extractCompileTopic(trimmed);
      if (compileTopic) {
        result.topic = compileTopic;
        result.rawTopic = compileTopic;
      }
    }
  }

  // ── Extract topic for generate-* intents ──────────────────────────────
  // "اعمل باور بوينت عن عبس" → topic = عبس
  // "make a presentation about AI" → topic = AI
  if (intentType === 'generate-pptx' || intentType === 'generate-docx' || intentType === 'generate-file') {
    const genTopic = extractGenTopic(trimmed);
    if (genTopic) {
      result.topic = genTopic;
      result.rawTopic = genTopic;
    } else {
      // Fallback: use the whole message as topic
      result.topic = trimmed;
      result.rawTopic = trimmed;
    }
    // Set format from intent type
    if (intentType === 'generate-pptx' && !result.format) {
      result.format = 'pptx';
    } else if (intentType === 'generate-docx' && !result.format) {
      result.format = 'docx';
    } else if (intentType === 'generate-file' && !result.format) {
      result.format = 'pptx'; // default
    }
  }

  // Detect format preference
  const format = detectFormat(trimmed);
  if (format) {
    result.format = format;
  }

  // Extract file hints
  const fileHints = extractFileHints(trimmed);
  if (fileHints.length > 0) {
    result.fileHints = fileHints;
  }

  // For compile/summarize with "كل" patterns, set scope to 'all'
  if (intentType === 'compile' || intentType === 'summarize') {
    if (/كل|كلهم|جميع|all|every/i.test(trimmed)) {
      result.scope = 'all';
    }
  }

  // For compare, always set scope to 'all' if multiple items mentioned,
  // or 'specific' if specific file hints are present
  if (intentType === 'compare') {
    if (result.fileHints && result.fileHints.length >= 2) {
      result.scope = 'specific';
    } else {
      result.scope = 'all';
    }
  }

  return result;
}

// ─── Convenience Functions ─────────────────────────────────────────────────

/**
 * Quick check if a message has any document intent.
 * Useful for routing decisions before full classification.
 */
export function hasDocIntent(message: string, hasAttachments: boolean): boolean {
  return classifyDocIntent(message, hasAttachments) !== null;
}

/**
 * Get the primary intent type without full classification.
 * Returns null if no intent detected.
 */
export function getDocIntentType(
  message: string,
  hasAttachments: boolean
): DocIntentType | null {
  const result = classifyDocIntent(message, hasAttachments);
  return result?.type ?? null;
}

/**
 * Check if the message is a quiz intent specifically.
 * Can be used as a filter before the full quiz-service pipeline.
 */
export function isDocQuizIntent(message: string, hasAttachments: boolean): boolean {
  const result = classifyDocIntent(message, hasAttachments);
  return result?.type === 'quiz';
}
