// ═══════════════════════════════════════════════════════════════════════
// DeltaAI Platform — Drive RAG Detection Module (Enhanced)
// ═══════════════════════════════════════════════════════════════════════
// Scans chat messages for filenames or file references and fetches
// content from Google Drive to provide as context for AI analysis.
//
// This module is SERVER-SIDE ONLY. Do not import in client-side code.
// ═══════════════════════════════════════════════════════════════════════

import { searchAndFetch, listDriveFiles, type DriveFile, type ParsedFileContent, type DriveSearchResult } from './google-drive.service';

// ─── Types ────────────────────────────────────────────────────────────

export interface DriveContext {
  /** Detected filename references from the message */
  detectedReferences: string[];
  /** Files found on Google Drive matching the references */
  files: DriveFile[];
  /** Parsed text content from the found files */
  contents: ParsedFileContent[];
  /** Any errors during the process */
  errors: string[];
  /** Whether any content was successfully fetched */
  hasContent: boolean;
  /** Whether this is just a file listing request (no specific file analysis) */
  isListOnly?: boolean;
}

// ─── Pattern Definitions ─────────────────────────────────────────────

/** Patterns that indicate a file reference in a message */
interface FileRefPattern {
  /** Regex pattern to match */
  pattern: RegExp;
  /** Which capture group contains the filename (0 = full match = list request) */
  groupIndex: number;
  /** Description of what this pattern matches */
  description: string;
}

const FILE_REF_PATTERNS: FileRefPattern[] = [
  // ─── Arabic: General Drive access requests (no specific filename) ───
  { pattern: /(?:ملفات|الملفات|المحاضرات|المذكرات|الملخصات)\s+(?:اللي|التي)?\s*(?:على|في)\s+(?:الدرايف|دايف|درايف|Drive|drive|جوجل درايف)/gi, groupIndex: 0, description: 'Arabic: ملفات على الدرايف (list all)' },
  { pattern: /(?:فيه|عندك|عندنا|موجود)\s+(?:ايه|إيه|اش|أي)\s+(?:على|في)\s+(?:الدرايف|دايف|درايف|Drive|drive)/gi, groupIndex: 0, description: 'Arabic: فيه ايه على الدرايف' },
  { pattern: /(?:اعرض|اظهر|وري|وريني|اريني|جيب|جيبلي)\s+(?:ملفات|المحاضرات|المذكرات|الملفات)\s+(?:الدرايف|دايف|درايف|Drive|drive|جوجل درايف|من الدرايف)/gi, groupIndex: 0, description: 'Arabic: اعرض ملفات الدرايف' },

  // ─── Arabic: Specific file references ───
  { pattern: /(?:الملف|ملف)\s+["'«»]([^\s"'«»]{2,60})["'«»]?/gi, groupIndex: 1, description: 'Arabic: ملف X' },
  { pattern: /(?:الملف|ملف)\s+([^\s,،.?؟!؛;]{2,60})/gi, groupIndex: 1, description: 'Arabic: ملف X (unquoted)' },
  { pattern: /ملف\s+(?:اسمه|باسم|اسمو|باسمو)\s+["'«»]?([^\s"'«»،,]{2,60})["'«»]?/gi, groupIndex: 1, description: 'Arabic: ملف اسمه X' },
  { pattern: /(?:المحاضرة|محاضرة|محاضرات)\s+["'«»]?([^\s"'«»]{2,60})["'«»]?/gi, groupIndex: 1, description: 'Arabic: محاضرة X' },
  { pattern: /(?:قال|ذكر|شرح)\s+(?:في|بـ?)\s+(?:محاضرة|ملف|مذكرة)\s+["'«»]?([^\s"'«»]{2,60})["'«»]?/gi, groupIndex: 1, description: 'Arabic: reference to lecture file' },
  { pattern: /(?:المذكرة|مذكرة)\s+["'«»]?([^\s"'«»]{2,60})["'«»]?/gi, groupIndex: 1, description: 'Arabic: مذكرة X' },
  { pattern: /ملف\s+(?:PDF|pdf|وورد|word|اكسل|excel|بوربوينت|powerpoint|عرض)\s+["'«»]?([^\s"'«»]{2,60})["'«»]?/gi, groupIndex: 1, description: 'Arabic: ملف PDF/Word/Excel X' },
  { pattern: /([^\s,،.?؟!؛;"'«»]{2,60})\s+ال(?:لي|ليّ)\s+(?:على|في)\s+(?:الدرايف|دايف|درايف|Drive|drive)/gi, groupIndex: 1, description: 'Arabic: X اللي على الدرايف' },
  { pattern: /(?:في|على)\s+(?:الدرايف|دايف|درايف|Drive|drive)\s+(?:اسمه|باسم|اسمو)?\s*["'«»]?([^\s"'«»،,]{2,60})["'«»]?/gi, groupIndex: 1, description: 'Arabic: على الدرايف X' },

  // Action + file reference
  { pattern: /(?:اشرح|حلل|لخّص|لخص|اقرأ|اقري|اذكر|عرف|شرح|تلخيص|تحليل|دور|دوري|ابحث|ابحثي|سحب|نزل)\s+(?:ملف|محاضرة|مذكرة|بحث|تقرير)?\s*["'«»]?([^\s"'«»،,.?؟!؛;]{2,60})["'«»]?/gi, groupIndex: 1, description: 'Arabic: action + file reference' },
  { pattern: /(?:البحث|بحث|التقرير|تقرير|الرسالة|رسالة)\s+["'«»]?([^\s"'«»]{2,60})["'«»]?/gi, groupIndex: 1, description: 'Arabic: بحث/تقرير X' },
  { pattern: /(?:ملخص|الملخص)\s+["'«»]?([^\s"'«»]{2,60})["'«»]?/gi, groupIndex: 1, description: 'Arabic: ملخص X' },

  // Search in Drive
  { pattern: /(?:دور|دوري|ابحث|ابحثي|سحب|نزل|جيب|جيبلي)\s+(?:من|على|في)\s+(?:الدرايف|دايف|درايف|Drive|drive|جوجل درايف)\s+(?:عن|على)?\s*["'«»]?([^\s"'«»،,.?؟!؛;]{2,60})["'«»]?/gi, groupIndex: 1, description: 'Arabic: دور في الدرايف عن X' },

  // ─── English patterns ───
  { pattern: /(?:the\s+)?(?:file|document|doc)\s+["']([^"']{2,60})["']/gi, groupIndex: 1, description: 'English: file "X"' },
  { pattern: /(?:the\s+)?(?:file|document|doc)\s+(?:called\s+|named\s+)?([^\s,.\-!?]{2,60})/gi, groupIndex: 1, description: 'English: file X (unquoted)' },
  { pattern: /(?:the\s+)?(?:lecture|notes|slides|presentation)\s+(?:on\s+|about\s+|for\s+)?["']?([^"',.!?\n]{2,60})["']?/gi, groupIndex: 1, description: 'English: lecture X' },
  { pattern: /([^\s,.\-!?]{2,60})\s+(?:on|from)\s+(?:the\s+)?(?:drive|google\s+drive)/gi, groupIndex: 1, description: 'English: X on the drive' },

  // ─── File extensions ───
  { pattern: /\b([^\s"'«»,\-]{1,50}\.(?:pdf|docx?|txt|csv|xlsx?|pptx?|md|rtf))\b/gi, groupIndex: 1, description: 'File with extension' },
  { pattern: /["'«»]([^\s"'«»]{2,60}\.(?:pdf|docx?|txt|csv|xlsx?|pptx?|md|rtf))["'«»]/gi, groupIndex: 1, description: 'Quoted filename with extension' },
];

// ─── Stop words to filter out false positives ─────────────────────────

const STOP_WORDS = new Set([
  'دي', 'ده', 'دا', 'هذا', 'هذي', 'هاد', 'هذا',
  'اللي', 'إلي', 'علي', 'في', 'من', 'عن', 'مع',
  'أن', 'إن', 'لا', 'لم', 'لن', 'قد', 'كان',
  'التالي', 'التالية', 'الآتي', 'الاتي', 'دها', 'ذات',
  'the', 'a', 'an', 'is', 'are', 'was', 'were',
  'this', 'that', 'these', 'those', 'it', 'its',
  'and', 'or', 'but', 'not', 'no', 'yes',
  'with', 'without', 'from', 'into', 'about',
  'please', 'can', 'could', 'would', 'should',
]);

// ─── Known Failure Markers ──────────────────────────────────────────
// These are the specific Arabic error/failure messages that the Google Drive
// service produces when extraction fails. We check against these explicitly
// rather than blanket-rejecting any text starting with '['.

const KNOWN_FAILURE_MARKERS = [
  '[ملف PDF يحتوي على نص عربي — لم يتم استخراجه بشكل صحيح',
  '[لم يتم استخراج نص PDF بشكل صحيح',
  '[لم يتم استخراج نص من ملف PDF',
  '[حدث خطأ أثناء استخراج نص PDF',
  '[حدث خطأ أثناء قراءة الملف',
  '[حدث خطأ أثناء قراءة ملف DOCX',
  '[حدث خطأ أثناء تحميل أو تحليل الملف',
  '[نوع الملف غير مدعوم',
  '[الملف كبير جداً',
  '[ملف Excel - لم يتم استخراج المحتوى',
  '[لم يتم استخراج نص من ملف DOCX',
  '[ملف PDF مرفق - محتوى جزئي',
];

/**
 * Check if text is a known extraction failure marker.
 * This is more precise than `text.startsWith('[')` which incorrectly
 * rejects legitimate content like JSON arrays, markdown links, etc.
 */
function isKnownFailureMarker(text: string): boolean {
  if (!text.startsWith('[')) return false;
  return KNOWN_FAILURE_MARKERS.some(marker => text.startsWith(marker));
}

/**
 * Classify extracted text content quality.
 * - 'usable': Clean, usable text content
 * - 'partial': Starts with a failure marker but has substantial real content after it
 * - 'failed': Known failure marker with no real content
 */
export function classifyContentQuality(text: string): 'usable' | 'partial' | 'failed' {
  if (!text || text.trim().length === 0) return 'failed';

  // If it doesn't start with '[', it's usable
  if (!text.startsWith('[')) return 'usable';

  // Check if it's a known failure marker
  if (isKnownFailureMarker(text)) {
    // Even if it starts with a failure marker, check if there's substantial
    // content after the marker (e.g., partial extraction where some pages worked)
    const firstBracketEnd = text.indexOf(']\n');
    if (firstBracketEnd > 0 && firstBracketEnd < text.length - 10) {
      const contentAfterMarker = text.slice(firstBracketEnd + 2).trim();
      // If there's substantial content (50+ chars) after the marker, it's partial
      if (contentAfterMarker.length >= 50) {
        return 'partial';
      }
    }
    return 'failed';
  }

  // Starts with '[' but NOT a known failure marker — could be JSON, markdown, etc.
  // Consider it usable if it has reasonable length
  return text.length >= 20 ? 'usable' : 'failed';
}

// ─── Core Functions ──────────────────────────────────────────────────

/**
 * Detect file references in a chat message.
 * Returns an array of candidate filename strings to search for.
 * Also detects generic Drive access requests (like "ملفات الدرايف") using wildcard '*'.
 */
export function detectFileReferences(message: string): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();
  let isDriveListRequest = false;

  for (const { pattern, groupIndex, description } of FILE_REF_PATTERNS) {
    let match;
    // Reset lastIndex for global regexes
    pattern.lastIndex = 0;

    while ((match = pattern.exec(message)) !== null) {
      const rawCandidate = (match[groupIndex] || match[0]).trim();

      // Check if this is a generic Drive list request (groupIndex 0 = full match)
      if (groupIndex === 0) {
        isDriveListRequest = true;
        console.log(`[Drive-RAG] Detected Drive list request: "${rawCandidate}" (pattern: ${description})`);
        continue;
      }

      // Skip if too short or a stop word
      if (rawCandidate.length < 2) continue;
      if (STOP_WORDS.has(rawCandidate.toLowerCase())) continue;

      // Normalize and deduplicate
      const normalized = rawCandidate
        .replace(/['"«»]/g, '')
        .trim();

      if (normalized.length < 2) continue;
      if (seen.has(normalized.toLowerCase())) continue;

      seen.add(normalized.toLowerCase());
      candidates.push(normalized);

      console.log(`[Drive-RAG] Detected file reference: "${normalized}" (pattern: ${description})`);
    }
  }

  // If it's a generic Drive list request with no specific filename,
  // use a wildcard to list all files
  if (isDriveListRequest && candidates.length === 0) {
    candidates.push('*'); // Wildcard — will list all files
    console.log('[Drive-RAG] No specific filename detected, will list all Drive files');
  }

  return candidates;
}

/**
 * Fetch Drive content for a message.
 * Detects file references, searches Google Drive, and returns metadata + content when available.
 * Content fetching is best-effort: if it fails, we still return file metadata.
 */
export async function fetchDriveContentForMessage(message: string): Promise<DriveContext | null> {
  try {
    // Step 1: Detect file references
    const references = detectFileReferences(message);

    if (references.length === 0) {
      return null;
    }

    console.log(`[Drive-RAG] Found ${references.length} file reference(s): ${references.join(', ')}`);

    // Step 2: Search for files and fetch content
    const allFiles: DriveFile[] = [];
    const allContents: ParsedFileContent[] = [];
    const allErrors: string[] = [];
    const seenFileIds = new Set<string>();

    for (const ref of references) {
      try {
        // Wildcard '*' means list all files in the Drive folder
        if (ref === '*') {
          const allDriveFiles = await listDriveFiles(20);
          for (const file of allDriveFiles) {
            if (!seenFileIds.has(file.id)) {
              seenFileIds.add(file.id);
              allFiles.push(file);
            }
          }
          continue;
        }

        const result: DriveSearchResult = await searchAndFetch(ref);

        // Deduplicate files
        for (const file of result.files) {
          if (!seenFileIds.has(file.id)) {
            seenFileIds.add(file.id);
            allFiles.push(file);
          }
        }

        // Add contents if any were successfully fetched
        allContents.push(...result.contents);
        allErrors.push(...result.errors);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        allErrors.push(`خطأ في البحث عن "${ref}": ${errorMsg}`);
        console.error(`[Drive-RAG] Error fetching content for "${ref}":`, error);
      }
    }

    // Use the improved content classification instead of the strict
    // `!c.text.startsWith('[')` check that rejects legitimate content
    const hasContent = allContents.length > 0 && allContents.some((c) => {
      const quality = classifyContentQuality(c.text);
      return quality === 'usable' || quality === 'partial';
    });
    const hasFiles = allFiles.length > 0;

    if (!hasFiles) {
      console.log('[Drive-RAG] No files found for references:', references.join(', '));
      return null;
    }

    // Log extraction results with quality classification
    const usableExtractions = allContents.filter((c) => classifyContentQuality(c.text) === 'usable');
    const partialExtractions = allContents.filter((c) => classifyContentQuality(c.text) === 'partial');
    const failedExtractions = allContents.filter((c) => classifyContentQuality(c.text) === 'failed');
    if (failedExtractions.length > 0) {
      console.warn(`[Drive-RAG] ${failedExtractions.length}/${allContents.length} file(s) had extraction failures:`, failedExtractions.map(c => c.fileName).join(', '));
    }
    if (partialExtractions.length > 0) {
      console.log(`[Drive-RAG] ${partialExtractions.length}/${allContents.length} file(s) had partial extractions:`, partialExtractions.map(c => c.fileName).join(', '));
    }
    console.log(`[Drive-RAG] Result: ${allFiles.length} files found, ${usableExtractions.length} usable, ${partialExtractions.length} partial, ${failedExtractions.length} failed`);

    return {
      detectedReferences: references.filter(r => r !== '*'),
      files: allFiles,
      contents: allContents,
      errors: allErrors,
      hasContent: hasContent || hasFiles,
      isListOnly: references.includes('*') && allContents.length === 0,
    };
  } catch (error) {
    console.error('[Drive-RAG] Error in fetchDriveContentForMessage:', error);
    return null;
  }
}

/**
 * Build a system prompt context string from Drive content.
 * This is prepended to the system prompt when Drive content is detected.
 */
export function buildDriveContextPrompt(context: DriveContext): string {
  if (!context.hasContent) {
    console.log('[Drive-RAG] buildDriveContextPrompt: No content to build prompt from');
    return '';
  }

  // If it's a list-only request, build a simple listing prompt
  if (context.isListOnly || (context.files.length > 0 && context.contents.length === 0)) {
    let prompt = '\n\n━━━ ملفات Google Drive ━━━\n';
    prompt += 'المستخدم يسأل عن الملفات المتاحة على Google Drive. ';
    prompt += 'أعرض عليه قائمة بالملفات المتاحة بالتفصيل.\n\n';

    for (let i = 0; i < context.files.length; i++) {
      const file = context.files[i];
      prompt += `${i + 1}. 📄 **${file.name}**\n`;
      prompt += `   النوع: ${file.mimeType}\n`;
      if (file.size) {
        const sizeKB = Math.round(parseInt(file.size) / 1024);
        prompt += `   الحجم: ${sizeKB > 1024 ? (sizeKB / 1024).toFixed(1) + ' MB' : sizeKB + ' KB'}\n`;
      }
      if (file.modifiedTime) {
        prompt += `   آخر تعديل: ${new Date(file.modifiedTime).toLocaleDateString('ar-EG')}\n`;
      }
      prompt += '\n';
    }

    prompt += 'أخبر المستخدم أنه يمكنه طلب تحليل أي ملف بالاسم مثل: "حلل ملف كوجنو" أو "اشرح محاضرة X".\n';
    prompt += '━━━ نهاية قائمة الملفات ━━━\n';
    return prompt;
  }

  // Classify content by quality: usable, partial, or failed
  const useableContents = context.contents.filter(
    (c) => c.text && classifyContentQuality(c.text) === 'usable'
  );
  const partialContents = context.contents.filter(
    (c) => c.text && classifyContentQuality(c.text) === 'partial'
  );
  const failedContents = context.contents.filter(
    (c) => c.text && classifyContentQuality(c.text) === 'failed'
  );

  // Full content analysis prompt
  let prompt = '\n\n━━━ سياق من Google Drive ━━━\n';
  prompt += 'المستخدم يشير إلى ملف/ملفات من Google Drive. ';
  prompt += 'يجب عليك تحليل المحتوى المرفق بشكل شامل ومفصل. ';
  prompt += 'أجب بناءً على هذا المحتوى مع الإشارة إلى مصدر المعلومات من الملف.\n\n';
  prompt += '⛔ قاعدة صارمة: يجب أن يكون كل ما تقوله مأخوذ حرفياً من النص أعلاه. لا تضف أي معلومات من عندك.\n';
  prompt += '⛔ إذا كان المحتوى المرفق فارغاً أو غير واضح، قل صراحةً أنك لم تتمكن من قراءة المحتوى بدلاً من اختراع محتوى.\n\n';

  if (useableContents.length > 0 || partialContents.length > 0) {
    const allUsableContents = [...useableContents, ...partialContents];
    const isMultiFile = allUsableContents.length > 1;

    prompt += `📄 محتوى الملفات المرفقة (${allUsableContents.length} ملف${isMultiFile ? 'ات' : ''}):\n\n`;

    for (let i = 0; i < allUsableContents.length; i++) {
      const content = allUsableContents[i];
      const quality = classifyContentQuality(content.text);
      const isPartial = quality === 'partial';

      prompt += `━━ الملف ${i + 1}: ${content.fileName} ━━\n`;
      prompt += `   النوع: ${content.mimeType}\n`;
      // Add file size as content richness indicator
      if (content.sizeBytes) {
        const sizeKB = Math.round(content.sizeBytes / 1024);
        prompt += `   الحجم: ${sizeKB > 1024 ? (sizeKB / 1024).toFixed(1) + ' MB' : sizeKB + ' KB'}\n`;
        // Size-based content richness hint
        if (sizeKB > 500) {
          prompt += '   📊 ملف كبير — قد يحتوي على محتوى غني ومفصل\n';
        }
      }
      if (content.truncated) {
        prompt += '   ⚠️ تم اقتطاع المحتوى بسبب حجم الملف الكبير — المحتوى المعروض جزئي\n';
      }
      if (isPartial) {
        prompt += '   ⚠️ محتوى جزئي — لم يتم استخراج كل النص بنجاح، لكن الجزء المعروض صحيح\n';
      }
      // Content length indicator
      prompt += `   طول المحتوى: ${content.text.length} حرف\n`;
      prompt += '---\n';

      // For partial content, extract the usable part after the failure marker
      if (isPartial) {
        const firstBracketEnd = content.text.indexOf(']\n');
        if (firstBracketEnd > 0) {
          prompt += content.text.slice(firstBracketEnd + 2).trim();
        } else {
          prompt += content.text;
        }
      } else {
        prompt += content.text;
      }
      prompt += '\n---\n\n';
    }

    // Multi-file specific instructions
    if (isMultiFile) {
      prompt += '📝 تعليمات خاصة بتحليل ملفات متعددة:\n';
      prompt += '- عند الإشارة لمعلومة، اذكر اسم الملف صراحةً مثل: «في ملف [اسم الملف]، ورد أن...»\n';
      prompt += '- قارن بين الملفات إن كان هناك تداخل في الموضوعات\n';
      prompt += '- رتب المعلومات حسب الملف المصدر في ملخصك\n';
      prompt += '- إذا كانت الملفات مترابطة، اعرض العلاقات بينها\n\n';
    }

    prompt += '📝 تعليمات التحليل:\n';
    prompt += '- اقرأ المحتوى بعناية وقدم تحليلاً أكاديمياً شاملاً\n';
    prompt += '- ⭐ استشهد بالمعلومات من الملف مع ذكر اسم الملف صراحةً (مثال: «حسب ملف [اسم الملف]...»)\n';
    prompt += '- رتب الأفكار بشكل منطقي ومنظم\n';
    prompt += '- أضف شرحاً للمصطلحات المعقدة إن وُجدت\n';
    prompt += '- قدم ملخصاً في البداية ثم التفاصيل\n';
    prompt += '- ⚠️ مهم جداً: لا تخترع أي معلومات ليست في النص المستخرج. إذا كان النص غير واضح أو ناقص، قل ذلك صراحةً ولا تضيف من عندك.\n';
    prompt += '- ⛔ يجب أن يكون كل ما تقوله مأخوذ حرفياً من النص أعلاه. لا تضف أي معلومات من عندك.\n';
    prompt += '- ⛔ إذا كان المحتوى المرفق فارغاً أو غير واضح، قل صراحةً أنك لم تتمكن من قراءة المحتوى بدلاً من اختراع محتوى.\n';
  } else {
    // No usable parsed content - tell AI to inform the user honestly
    // VERY IMPORTANT: The AI must NOT attempt to describe the file content
    prompt += '🚫🚫🚫 تحذير حرج: لم يتم استخراج أي نص من هذه الملفات! 🚫🚫🚫\n';
    prompt += '⚠️ تم العثور على الملفات التالية ولكن لم يتم استخراج المحتوى النصي بنجاح.\n';
    prompt += 'هذا يحدث عادةً مع ملفات PDF العربية لأن استخراج النص من PDF لا يدعم العربية بشكل كامل.\n\n';
    prompt += '⛔⛔⛔ تعليمات صارمة جداً — يجب اتباعها حرفياً: ⛔⛔⛔\n';
    prompt += '1. الملف موجود على الدرايف وتم العثور عليه\n';
    prompt += '2. لم نتمكن من استخراج النص بسبب قيود تقنية في قراءة PDF العربي\n';
    prompt += '3. اقترح عليه رفع الملف بصيغة DOCX أو TXT للحصول على نتائج أفضل\n';
    prompt += '4. ⛔ لا تخترع أي محتوى عن الملف — لم تتم قراءته أبداً\n';
    prompt += '5. ⛔ لا تصف محتوى الملف أو تلخصه — أنت لا تعرف ما فيه\n';
    prompt += '6. ⛔ لا تتخيل أو تفترض أي شيء عن محتوى الملف\n';
    prompt += '7. قل صراحةً: "لم أتمكن من قراءة محتوى هذا الملف" فقط\n\n';

    for (let i = 0; i < context.files.length; i++) {
      const file = context.files[i];
      prompt += `📄 الملف ${i + 1}: ${file.name}\n`;
      prompt += `   النوع: ${file.mimeType}\n`;
      if (file.size) {
        const sizeKB = Math.round(parseInt(file.size) / 1024);
        prompt += `   الحجم: ${sizeKB > 1024 ? (sizeKB / 1024).toFixed(1) + ' MB' : sizeKB + ' KB'}\n`;
      }
      if (file.webViewLink) {
        prompt += `   الرابط: ${file.webViewLink}\n`;
      }
      prompt += '\n';
    }

    // Also show what errors occurred
    for (const fc of failedContents) {
      prompt += `⚠️ ${fc.fileName}: ${fc.text}\n`;
    }
  }

  if (context.errors.length > 0) {
    prompt += '⚠️ أخطاء حدثت أثناء المعالجة:\n';
    for (const error of context.errors) {
      prompt += `  - ${error}\n`;
    }
    prompt += '\nأخبر المستخدم عن هذه الأخطاء بصراحة حتى يتمكن من اتخاذ إجراء (مثل تغيير صيغة الملف).\n\n';
  }

  prompt += '━━━ نهاية سياق Google Drive ━━━\n';

  console.log(`[Drive-RAG] Built context prompt: ${prompt.length} chars, ${useableContents.length} usable, ${partialContents.length} partial, ${failedContents.length} failed`);

  return prompt;
}
