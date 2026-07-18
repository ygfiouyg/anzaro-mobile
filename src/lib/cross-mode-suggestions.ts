// DeltaAI — Cross-Mode Suggestion System
// Detects when a user's question could benefit from another AI mode
// and suggests the switch with Arabic text

export interface CrossModeSuggestion {
  fromModel: string;   // current model ID
  toModel: string;     // suggested model ID
  trigger: string;     // what triggered the suggestion
  suggestion: string;  // Arabic text of the suggestion
  example?: string;    // example of what the other mode could do
}

interface DetectionRule {
  toModel: string;
  keywords: string[];
  trigger: string;
  suggestion: string;
  example: string;
  excludeIfCurrentModel: string[]; // don't suggest if already in these models
}

const DETECTION_RULES: DetectionRule[] = [
  // 1. Medical question → suggest delta-doctor
  {
    toModel: 'delta-doctor',
    keywords: [
      'ألم', 'وجع', 'مرض', 'علاج', 'دواء', 'طبيب', 'عيان', 'صداع',
      'حمى', 'سعال', 'رشح', 'التهاب', 'جراحة', 'تحليل', 'أشعة',
      'ضغط', 'سكر', 'كوليسترول', 'قلب', 'معدة', 'عظام', 'جلدية',
      'medical', 'doctor', 'pain', 'illness', 'treatment', 'symptom',
      'تشخيص', 'حساسية', 'أزمة', 'ربو', 'كحة',
    ],
    trigger: 'سؤال طبي',
    suggestion: 'ممكن تفيدك كمان: دلتا الطبيب 🩺',
    example: 'هيساعدك في فهم الأعراض والنصائح الصحية',
    excludeIfCurrentModel: ['delta-doctor', 'delta-pharmacy'],
  },
  // 2. Quran/Hadith → suggest delta-islamic
  {
    toModel: 'delta-islamic',
    keywords: [
      'قرآن', 'حديث', 'آية', 'سورة', 'فقه', 'حلال', 'حرام',
      'صلاة', 'زكاة', 'صيام', 'حج', 'عمرة', 'دعاء', 'أذكار',
      'شريعة', 'إسلام', 'مسلم', 'تفسير', 'سنة', 'بدعة',
      'quran', 'hadith', 'islam', 'prayer', 'dua', 'fiqh',
      'رمضان', 'عيد', 'جمعة', 'مسجد', 'إمام', 'وضوء', 'تيمم',
    ],
    trigger: 'سؤال إسلامي',
    suggestion: 'ممكن تفيدك كمان: دلتا إسلامي 🕌',
    example: 'هيرد عليك بالأدلة الشرعية والفتاوى الموثوقة',
    excludeIfCurrentModel: ['delta-islamic'],
  },
  // 3. Frustration/sadness → suggest delta-psychology
  {
    toModel: 'delta-psychology',
    keywords: [
      'تعبان', 'حزين', 'زهقان', 'ملحو', 'قلقان', 'متوتر', 'خايف',
      'مش عارف', 'محبط', 'يائس', 'كئيب', 'وحداني', 'عيان نفسياً',
      'ضغط نفسي', 'اكتئاب', 'قلق', 'خوف', 'توتر', 'أرق',
      'stressed', 'sad', 'depressed', 'anxious', 'overwhelmed', 'lonely',
      'مش قادر', 'مش قادرة', 'حاسس', 'حاسة', 'بكاء', 'دموع',
    ],
    trigger: 'مشاعر صعبة',
    suggestion: 'ممكن تفيدك كمان: دلتا الدعم النفسي 🧘',
    example: 'هيساعدك تتعامل مع المشاعر الصعبة ويدعمك',
    excludeIfCurrentModel: ['delta-psychology'],
  },
  // 4. Law question → suggest delta-law
  {
    toModel: 'delta-law',
    keywords: [
      'قانون', 'محكمة', 'محامي', 'عقد', 'قضية', 'حقوق', 'واجبات',
      'دعوى', 'حكم', 'تشريع', 'دستور', 'جريمة', 'عقوبة', 'غرامة',
      'إيجار', 'تمليك', 'طلاق', 'ميراث', 'وصاية', 'حضانة',
      'law', 'legal', 'court', 'lawyer', 'contract', 'lawsuit',
      'شكوى', 'نيابة', 'شرطة', 'بلاغ', 'جنائي', 'مدني',
    ],
    trigger: 'سؤال قانوني',
    suggestion: 'ممكن تفيدك كمان: دلتا القانون ⚖️',
    example: 'هيشرحلك حقوقك القانونية والإجراءات بالتفصيل',
    excludeIfCurrentModel: ['delta-law'],
  },
  // 5. Drugs/medications → suggest delta-pharmacy
  {
    toModel: 'delta-pharmacy',
    keywords: [
      'دواء', 'حبوب', 'كبسولات', 'شراب', 'حقن', 'مرهم', 'كريم',
      'جرعة', 'آثار جانبية', 'تفاعل دوائي', 'مضاد حيوي', 'مسكن',
      'مضاد التهاب', 'خافض حرارة', 'مهدئ', 'منوم', 'فيتامين',
      'medication', 'drug', 'pill', 'dosage', 'side effect', 'pharmacy',
      'صيدلية', 'وصفة', 'بدائل دوائية', 'موانع', 'تحذيرات',
    ],
    trigger: 'سؤال صيدلي',
    suggestion: 'ممكن تفيدك كمان: دلتا الصيدلة 💊',
    example: 'هيوضحلك الجرعات والتفاعلات الدوائية',
    excludeIfCurrentModel: ['delta-doctor', 'delta-pharmacy'],
  },
  // 6. Coding question → suggest delta-code
  {
    toModel: 'delta-code',
    keywords: [
      'كود', 'برمجة', 'بايثون', 'جافا', 'جافاسكريبت', 'رياكت',
      'برنامج', 'تطبيق', 'موقع', 'ويب', 'API', 'قاعدة بيانات',
      'خطأ برمجي', 'bug', 'debug', 'كومبايل', 'تشغيل كود',
      'code', 'programming', 'python', 'javascript', 'react', 'next',
      'HTML', 'CSS', 'TypeScript', 'SQL', 'git', 'docker',
      'فونتكشن', 'كلاس', 'أوبجكت', 'لوب', 'إيري', 'string',
    ],
    trigger: 'سؤال برمجي',
    suggestion: 'ممكن تفيدك كمان: دلتا كود 💻',
    example: 'هيكتبلك الكود ويشرحه خطوة بخطوة',
    excludeIfCurrentModel: ['delta-code'],
  },
  // 7. Research question → suggest delta-research
  {
    toModel: 'delta-research',
    keywords: [
      'بحث', 'دراسة', 'رسالة ماجستير', 'دكتوراه', 'ورقة علمية',
      'مرجع', 'مصدر', 'استشهاد', 'منهج بحث', 'فرضية', 'نتائج',
      'تحليل بيانات', 'إحصاء', 'عينة', 'استبيان', 'مقابلة',
      'research', 'thesis', 'paper', 'study', 'methodology',
      'ملخص بحث', 'خطة بحث', 'أدبيات', 'مراجعة أدبية',
    ],
    trigger: 'سؤال بحثي',
    suggestion: 'ممكن تفيدك كمان: دلتا الأبحاث 🔬',
    example: 'هيساعدك في تصميم البحث وتحليل البيانات',
    excludeIfCurrentModel: ['delta-research'],
  },
  // 8. Egyptian dialect → suggest delta-egyptian
  {
    toModel: 'delta-egyptian',
    keywords: [
      'إزاي', 'ليه', 'إيه', 'فين', 'امتى', 'عامل إيه', 'إيه الأخبار',
      'يا مان', 'يا باشا', 'الحمد لله', 'من عيني', 'ولا يهمك',
      'عاش', 'تمام', 'أيوه', 'لا', 'شكلك', 'بص',
      'how come', 'what\'s up', 'what\'s going on',
      'يا صاحبي', 'نفساني', 'عيز', 'عايز', 'مش عارف', 'مش فاهم',
    ],
    trigger: 'عامية مصرية',
    suggestion: 'ممكن تفيدك كمان: دلتا مصري 🇪🇬',
    example: 'هيرد عليك بالعامية المصرية الأصيلة',
    excludeIfCurrentModel: ['delta-egyptian'],
  },
  // 9. History question → suggest delta-history
  {
    toModel: 'delta-history',
    keywords: [
      'تاريخ', 'حضارة', 'فراعنة', 'أهرامات', 'مملوك', 'عثماني',
      'أندلس', 'عباسي', 'أموي', 'فاطمي', 'أيوبي', 'محمود',
      'حرب عالمية', 'ثورة', 'استقلال', 'مستعمرة', 'معاهدة',
      'history', 'civilization', 'pharaohs', 'ancient', 'medieval',
      'خلافة', 'سلطان', 'ملك', 'إمبراطورية', 'غزو', 'فتح',
    ],
    trigger: 'سؤال تاريخي',
    suggestion: 'ممكن تفيدك كمان: دلتا التاريخ 📜',
    example: 'هيحكيلك التاريخ بأسلوب سردي شيق',
    excludeIfCurrentModel: ['delta-history', 'delta-historian'],
  },
  // 10. Creative/writing → suggest delta-creative
  {
    toModel: 'delta-creative',
    keywords: [
      'اكتب', 'قصة', 'رواية', 'شعر', 'نظم', 'مقال', 'خاطرة',
      'إبداع', 'تخيل', 'فكرة إبداعية', 'سيناريو', 'حوار',
      'كتابة', 'تأليف', 'نشر', 'مدونة', 'محتوى',
      'creative', 'write', 'story', 'poem', 'novel', 'article',
      'قصيدة', 'أغنية', 'كلمات', 'ألحان', 'رسم', 'تصميم',
    ],
    trigger: 'كتابة إبداعية',
    suggestion: 'ممكن تفيدك كمان: دلتا كريتيف 🎨',
    example: 'هيبدع معاك في الكتابة ويطلع أفكار جديدة',
    excludeIfCurrentModel: ['delta-creative', 'delta-poet'],
  },
];

/**
 * Get cross-mode suggestions for a given user message and current model.
 * Returns up to 2 suggestions, prioritized by match strength.
 */
export function getCrossModeSuggestions(
  message: string,
  currentModel: string
): CrossModeSuggestion[] {
  const lower = message.toLowerCase();
  const suggestions: Array<{ rule: DetectionRule; matchCount: number }> = [];

  for (const rule of DETECTION_RULES) {
    // Skip if already in a related model
    if (rule.excludeIfCurrentModel.includes(currentModel)) continue;
    // Also skip if the suggested model IS the current model
    if (rule.toModel === currentModel) continue;

    // Count how many keywords match
    let matchCount = 0;
    for (const keyword of rule.keywords) {
      if (lower.includes(keyword.toLowerCase())) {
        matchCount++;
      }
    }

    // Require at least 1 keyword match (more matches = higher priority)
    if (matchCount > 0) {
      suggestions.push({ rule, matchCount });
    }
  }

  // Sort by match count descending, take top 2
  suggestions.sort((a, b) => b.matchCount - a.matchCount);
  const topSuggestions = suggestions.slice(0, 2);

  return topSuggestions.map(({ rule }) => ({
    fromModel: currentModel,
    toModel: rule.toModel,
    trigger: rule.trigger,
    suggestion: rule.suggestion,
    example: rule.example,
  }));
}
