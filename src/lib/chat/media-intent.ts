// ─── Inline Media Generation Intent Detection ─────────────────────────

/**
 * Detect if the user message is requesting image or video generation.
 * Returns the media type and extracted prompt, or null if no intent detected.
 * This enables inline generation in the chat stream (like ChatGPT).
 */
export function detectInlineMediaGenIntent(msg: string): { type: 'image' | 'video'; prompt: string } | null {
  const lower = msg.trim().toLowerCase();
  // Skip very short messages (likely not generation requests)
  if (lower.length < 3) return null;
  // Skip messages that are clearly questions, not requests
  if (/^(هل|ما|من|اين|كيف|ليه|ليش|امتى|إمتى|عاملة ايه|ايه رأيك|ازاي)/i.test(lower)) return null;

  // FIX #6: Skip phrases where "draw" means something other than image generation
  // e.g., "draw a conclusion", "draw attention", "draw from", "draw out"
  const nonImageDrawPhrases = [
    /draw\s+(a\s+)?(conclusion|inference|distinction|parallel|comparison|line|boundary)/i,
    /draw\s+(attention|focus|from|out|up|on|near|closer|back|away|off)/i,
    /draw\s+the\s+(line|curtain|attention|conclusion)/i,
  ];
  if (nonImageDrawPhrases.some(p => p.test(lower))) return null;
  // Arabic patterns for image generation
  const imagePatterns = [
    /اعمل[ي]?\s+صور[ةه]/i,
    /صور[ةه]\s+(عن|من|ل)/i,
    /ارسم(لي)?\s+(صور[ةه]?|رسم[ةه]?|لوح[ةه]|خريط[ةه]|منظر|مشهد|وجه|قلب|ورد|شجر|بنت|ولد|راجل|ست|طفل|قط|كلب|طائر|فراش|بحر|سماء|غروب|شروق|مدينة|جبل|نهر|قمر|شمس|نجم|بيت|سيارة|طائرة|سفينة|كوكب)/i,
    /ارسملي\s+/i,
    /ارسم\s*$/i,
    /ولد\s+صور[ةه]/i,
    /طلع\s+صور[ةه]/i,
    /صوّر(لي)?\s/i,
    /جيب\s+صور[ةه]/i,
    /صور[ةه]\s+(كلب|قطة|طفل|ست|راجل|بنت|ولد|بحر|سماء|ورد|غروب|مدينة|جبل|نهر)/i,
    /generate\s+(an?\s+)?image/i,
    /make\s+(an?\s+)?image/i,
    /create\s+(an?\s+)?image/i,
    /draw\s+(me\s+)?(an?\s+)?(image|picture|portrait|landscape|scene|illustration|painting|sketch|drawing|cat|dog|person|woman|man|child|bird|tree|house|car|city|mountain|river|sunset|flower|dragon|robot|character)/i,
  ];
  // Arabic patterns for video generation
  const videoPatterns = [
    /اعمل[ي]?\s+(فيديو|فديو)/i,
    /(فيديو|فديو)\s+(عن|من|ل)/i,
    /طلع\s+(فيديو|فديو)/i,
    /generate\s+(a\s+)?video/i,
    /make\s+(a\s+)?video/i,
    /create\s+(a\s+)?video/i,
  ];
  // Check video first (more specific)
  for (const pattern of videoPatterns) {
    if (pattern.test(lower)) {
      let prompt = msg.trim();
      prompt = prompt.replace(/^(اعمل[ي]?|ولد|طلع|جيب)\s+(فيديو|فديو)\s*/i, '');
      prompt = prompt.replace(/^(generate|make|create)\s+(a\s+)?video\s*(of|about|for)?\s*/i, '');
      return { type: 'video', prompt: prompt.trim() || msg.trim() };
    }
  }
  // Check image patterns
  for (const pattern of imagePatterns) {
    if (pattern.test(lower)) {
      let prompt = msg.trim();
      // Remove Arabic generation verbs with optional suffixes (ارسم/ارسملي/اعملي/صوري etc.)
      prompt = prompt.replace(/^(ارسم(لي|ي)?|اعمل[ي]?(لي|ي)?|ولد(لي|ي)?|طلع(لي|ي)?|جيب(لي|ي)?|صوّر(لي|ي)?)\s+(صور[ةه]?)\s*/i, '');
      prompt = prompt.replace(/^(ارسم(لي|ي)?|صوّر(لي|y)?)\s*/i, '');
      // Remove English generation verbs
      prompt = prompt.replace(/^(generate|make|create|draw)\s+(me\s+)?(an?\s+)?(image\s*)?(of|about|for)?\s*/i, '');
      return { type: 'image', prompt: prompt.trim() || msg.trim() };
    }
  }
  return null;
}
