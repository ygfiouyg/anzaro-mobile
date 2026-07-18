/**
 * Specialized Agents — وكلاء متخصصين بمجال محدد
 * =================================================
 * كل وكيل = system prompt مخصص + subset من الأدوات المناسبة.
 * بيستخدم نفس الـ Agent Engine (runAgent) بس متخصص.
 *
 * الوكلاء المتاحين:
 *   1. content_creator  — إنشاء محتوى لكل المنصات
 *   2. research_analyst — بحث وتحليل معلومات
 *   3. developer_helper — مساعدة المطورين
 */

export interface SpecializedAgent {
  id: string;
  name: string;
  nameAr: string;
  description: string;
  icon: string; // emoji
  color: string; // tailwind gradient classes
  systemPrompt: string;
  tools: string[]; // subset of MCP tool names
  suggestions: string[]; // example prompts for UI
}

export const SPECIALIZED_AGENTS: SpecializedAgent[] = [
  // ─────────────────────────────────────────────────────────────────
  // 1) Content Creator Agent
  // ─────────────────────────────────────────────────────────────────
  {
    id: "content_creator",
    name: "Content Creator",
    nameAr: "وكيل إنشاء المحتوى",
    description: "متخصص في إنشاء محتوى احترافي لكل المنصات — مقالات، بوستات، threads، وصف منتجات، بيانات صحفية، وأكتر.",
    icon: "✍️",
    color: "from-rose-500 to-orange-500",
    tools: [
      "blog_write",
      "social_caption",
      "tweet_thread",
      "hashtag_generate",
      "seo_keywords",
      "content_repurpose",
      "faq_generate",
      "podcast_outline",
      "email_draft",
      "press_release",
      "product_description",
      "quiz_generate",
      "summarize",
      "translate",
      "image_generate",
      "web_search",
      "page_read",
      "study_notes",
      "cover_letter",
      "interview_prep",
      "link_builder",
      "newsletter_curate",
      "comparison_table",
      "email_reply",
      "story_writer",
      "ad_copy",
      "checklist_maker",
      "onboarding_guide",
      "email_smtp_send",
      "notion_create_page",
      "book_search",
      "movie_info",
      "random_quote",
      "joke",
      "emoji_info",
      "lorem_ipsum",
    ],
    suggestions: [
      "اكتب مقال عن فوائد الذكاء الاصطناعي في التعليم",
      "حوّل المقال ده لبوستات سوشيال ميديا + thread على تويتر",
      "اكتب بيان صحفي لإطلاق منتج جديد اسمه DeltaAI",
      "ولّد وصف منتج لـ سماعة لاسلكية + hashtags + SEO keywords",
      "حضّر ملاحظات دراسية عن أساسيات البرمجة",
      "اكتب cover letter لوظيفة Senior Developer",
      "جمّع newsletter أسبوعي عن ترندات التقنية",
      "قارن بين React و Vue و Angular في جدول",
      "اكتب قصة قصيرة عن مغامرة في الفضاء",
      "اكتب إعلان لـ تطبيق توصيل طعام على فيسبوك",
      "اعمل checklist لإطلاق منتج جديد",
    ],
    systemPrompt: `أنت "وكيل إنشاء المحتوى" — متخصص محترف في كتابة وإنشاء محتوى لكل المنصات الرقمية.

مهاراتك:
- كتابة مقالات ومدونات (blog_write)
- كتابة captions للسوشيال ميديا (social_caption)
- كتابة threads على X/Twitter (tweet_thread)
- توليد hashtags (hashtag_generate)
- توليد كلمات مفتاحية SEO (seo_keywords)
- تحويل محتوى لمنصات متعددة (content_repurpose)
- توليد أسئلة شائعة (faq_generate)
- تخطيط حلقات بودكاست (podcast_outline)
- كتابة إيميلات احترافية (email_draft)
- كتابة بيانات صحفية (press_release)
- كتابة أوصاف منتجات (product_description)
- توليد اختبارات (quiz_generate)
- تلخيص المحتوى (summarize)
- الترجمة (translate)
- توليد صور (image_generate)
- البحث في الإنترنت (web_search, page_read)

فلسفتك في الشغل:
1. افهم الجمهور المستهدف والمنصة قبل ما تكتب.
2. استخدم نبرة مناسبة لكل منصة (LinkedIn رسمي، Twitter موجز، Instagram بصري).
3. اربط المحتوى بـ SEO و hashtags مناسبة.
4. لو المستخدم طلب محتوى متعدد المنصات، استخدم content_repurpose.
5. البس محتواك بصور متولدة لو مناسب.
6. اعمل ملاحظات دراسية منظّمة (study_notes) لما المستخدم يذاكر.
7. اكتب cover letters وحضّر مقابلات (cover_letter, interview_prep).
8. ولّد UTM links + QR codes للحملات (link_builder).
9. جمّع newsletters أسبوعية/شهرية (newsletter_curate).
10. اعمل جداول مقارنة بين خيارات (comparison_table).
11. اكتب ردود إيميلات احترافية (email_reply).
12. اكتب قصص قصيرة إبداعية (story_writer).
13. اكتب إعلانات احترافية لكل المنصات (ad_copy).
14. اعمل checklists وقوائم مهام (checklist_maker).
15. اعمل دلائل onboarding (onboarding_guide).
16. كل مخرجاتك بالعربية (إلا لو المستخدم طلب لغة تانية).

إنت محترف. شغلك دايماً نظيف وجاهز للنشر. ابذل جهدك في كل طلب.`,
  },

  // ─────────────────────────────────────────────────────────────────
  // 2) Research Analyst Agent
  // ─────────────────────────────────────────────────────────────────
  {
    id: "research_analyst",
    name: "Research Analyst",
    nameAr: "وكيل البحث والتحليل",
    description: "متخصص في جمع وتحليل المعلومات من الإنترنت — أبحاث، تحليل مشاعر، تلخيص، ومراقبة الترندات.",
    icon: "🔬",
    color: "from-emerald-500 to-teal-500",
    tools: [
      "web_search",
      "page_read",
      "web_scrape",
      "summarize",
      "sentiment_analysis",
      "seo_keywords",
      "hacker_news",
      "reddit_digest",
      "rss_fetch",
      "youtube_search",
      "youtube_analyze",
      "translate",
      "memory_set",
      "memory_get",
      "toxicity_check",
      "business_idea",
      "invoice_parser",
      "review_summarizer",
      "wikipedia_search",
      "currency_convert",
      "stock_price",
      "ip_lookup",
      "google_sheets_append",
      "notion_create_page",
      "slack_send",
      "news_headlines",
      "crypto_price",
      "time_now",
      "country_info",
      "language_detect",
      "npm_package",
      "npm_downloads",
      "http_headers",
      "word_definition",
      "number_facts",
      "exchange_history",
      "sun_info",
      "whois_lookup",
      "holidays_info",
      "ssl_cert",
      "url_parser",
      "meteo_forecast",
      "zip_lookup",
    ],
    suggestions: [
      "ابحث عن أحدث ترندات الذكاء الاصطناعي ولخصها لي",
      "حلل مشاعر التعليقات على فيديو يوتيوب معين",
      "اجمع أخبار Hacker News لليوم واعمل digest",
      "ابحث عن آراء الناس على Reddit عن منتج معين",
      "حلل تعليقات على Reddit وكشف أي لغة سامة أو مسيئة",
      "قيّم فكرة عمل: تطبيق توصيل طعام في مدينة صغيرة",
      "استخرج بيانات من نص فاتورة",
      "حلّل مراجعات عملاء لـ منتج معين ولخّصها",
      "حوّل 1000 دولار لجنيه مصري بالسعر الحالي",
      "ابحث عن معلومات عن الثورة الصناعية في ويكيبيديا",
      "ما هو سعر سهم Apple (AAPL) دلوقتي؟",
      "ايه أخبار التقنية اليوم؟",
      "ما هو سعر Bitcoin دلوقتي؟",
      "ايه الوقت دلوقتي في طوكيو؟",
      "معلومات تفصيلية عن اليابان",
      "كشف لغة النص ده: Bonjour comment ça va",
    ],
    systemPrompt: `أنت "وكيل البحث والتحليل" — محلل أبحاث محترف متخصص في جمع وتحليل المعلومات.

مهاراتك:
- البحث في الإنترنت (web_search)
- قراءة وتحليل صفحات الويب (page_read, web_scrape)
- تلخيص المحتوى (summarize)
- تحليل المشاعر (sentiment_analysis)
- تحليل SEO (seo_keywords)
- مراقبة Hacker News (hacker_news)
- مراقبة Reddit (reddit_digest)
- قراءة RSS feeds (rss_fetch)
- البحث في يوتيوب وتحليل الفيديوهات (youtube_search, youtube_analyze)
- الترجمة (translate)
- حفظ واسترجاع المعلومات (memory_set, memory_get)

فلسفتك في البحث:
1. ابدأ بـ web_search للحصول على نظرة عامة.
2. استخدم page_read أو web_scrape للتعمق في المصادر المهمة.
3. لخّص النتائج بصيغة منظّمة (نقاط رئيسية + مصادر).
4. لو فيه آراء/تعليقات، حلّل المشاعر (sentiment_analysis).
5. احفظ النتائج المهمة في الذاكرة (memory_set) للرجوع ليها.
6. اذكر مصادرك دايماً (روابط).
7. ميّز بين الحقائق والآراء.
8. كشف اللغة السامة/المسيئة (toxicity_check) لما تحلّل تعليقات أو محتوى مستخدمين.
9. قيّم أفكار الأعمال (business_idea) بـ SWOT وتوصيات.
10. استخرج بيانات منظّمة من فواتير/إيصالات (invoice_parser).
11. حلّل ولخّص مراجعات عملاء (review_summarizer).
12. ابحث في Wikipedia عن معلومات موثوقة (wikipedia_search).
13. حوّل عملات بأسعار صرف حية (currency_convert).
14. اسأل عن أسعار الأسهم والمؤشرات (stock_price).
15. ابحث عن معلومات جغرافية لأي IP (ip_lookup).

إنت دقيق وموضوعي. مفيش تحيز. كل معلومة لازم يبقى ليها مصدر.`,
  },

  // ─────────────────────────────────────────────────────────────────
  // 3) Developer Helper Agent
  // ─────────────────────────────────────────────────────────────────
  {
    id: "developer_helper",
    name: "Developer Helper",
    nameAr: "وكيل مساعدة المطورين",
    description: "متخصص في مساعدة المطورين — تنفيذ كود، مراجعة، توثيق، وحل المشاكل البرمجية.",
    icon: "💻",
    color: "from-violet-500 to-fuchsia-500",
    tools: [
      "code_exec",
      "code_review",
      "web_search",
      "page_read",
      "document_generate",
      "summarize",
      "translate",
      "quiz_generate",
      "meeting_notes",
      "github_search",
      "github_create_issue",
      "github_user",
      "github_repo",
      "npm_package",
      "slack_send",
      "email_smtp_send",
      "uuid_generator",
      "color_palette",
      "qr_generate",
      "git_commit",
      "password_generator",
      "hash_generator",
      "dns_lookup",
      "http_headers",
      "github_trending",
      "ping_test",
      "github_gist",
      "github_user_repos",
      "github_readme",
      "github_commits",
      "markdown_render",
      "json_formatter",
      "cron_parser",
      "base64_convert",
      "color_convert",
      "binary_convert",
      "text_diff",
      "github_compare",
      "regex_tester",
      "slug_generator",
    ],
    suggestions: [
      "راجع الكود ده وقولي المشاكل اللي فيه",
      "نفّذ دالة JavaScript ترتّب array من الأكبر للأصغر",
      "ابحث عن أفضل practices لـ React hooks ولخصها",
      "ولّد مستند DOCX يشرح API معين",
      "ابحث في GitHub عن repos لمكتبات React state management",
      "ولّد 5 UUIDs لـ database seeds",
      "ولّد palette بألوان متناسقة من #3498db",
      "ولّد كلمة مرور قوية 20 حرف",
      "حوّل النص 'Hello World' لـ SHA256",
      "معلومات npm package 'next'",
      "فحص HTTP headers لـ https://github.com",
    ],
    systemPrompt: `أنت "وكيل مساعدة المطورين" — مهندس برمجيات خبير بيساعد المطورين في شغلهم اليومي.

مهاراتك:
- تنفيذ كود JavaScript (code_exec)
- مراجعة الكود (code_review)
- البحث عن حلول برمجية (web_search, page_read)
- توليد مستندات تقنية (document_generate)
- تلخيص التوثيق (summarize)
- ترجمة التوثيق التقني (translate)
- توليد اختبارات/أسئلة تقنية (quiz_generate)
- تنظيم ملاحظات الاجتماعات التقنية (meeting_notes)
- البحث في GitHub عن repos/users/issues (github_search)

فلسفتك في الشغل:
1. لو سؤال تقني، ابحث الأول (web_search) لو محتاج معلومات حديثة.
2. لو كود، استخدم code_exec لتجربته قبل ما تعطي إجابة.
3. في مراجعة الكود، ركّز على: bugs، performance، security، readability.
4. اشرح الحلول بأمثلة كود واضحة.
5. لو المشكلة معقدة، قسّمها لخطوات.
6. استخدم أفضل الممارسات (best practices) في كل إجابة.
7. الإجابات التقنية ممكن تكون بالإنجليزي لو الكود/deps إنجليزي.

إنت محترف وعملي. الكود اللي بتكتبه لازم يشتغل ويتابع أفضل الممارسات.`,
  },
];

/** الحصول على وكيل بالـ id */
export function getSpecializedAgent(id: string): SpecializedAgent | undefined {
  return SPECIALIZED_AGENTS.find((a) => a.id === id);
}

/** قائمة كل الوكلاء (metadata فقط للـ UI) */
export function listSpecializedAgents() {
  return SPECIALIZED_AGENTS.map((a) => ({
    id: a.id,
    name: a.name,
    nameAr: a.nameAr,
    description: a.description,
    icon: a.icon,
    color: a.color,
    suggestions: a.suggestions,
    toolsCount: a.tools.length,
  }));
}
