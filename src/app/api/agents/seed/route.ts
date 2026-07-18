/**
 * GET /api/agents/seed  — يضيف 3 وكلاء جاهزين لو ما فيش أي وكيل موجود
 *
 * بنـ skip لو فيه agents موجودة بالفعل.
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SEED_AGENTS = [
  {
    name: "وكيل البحث والتحليل",
    nameEn: "Research Agent",
    description: "متخصص في البحث في الإنترنت وويكيبيديا وتحليل المعلومات.",
    icon: "🔬",
    color: "from-emerald-500 to-teal-500",
    systemPrompt: `أنت "وكيل البحث والتحليل" — محلل أبحاث محترف متخصص في جمع وتحليل المعلومات.

مهاراتك:
- البحث في الإنترنت (web_search)
- قراءة صفحات الويب (page_read)
- البحث في ويكيبيديا (wikipedia_search)
- تلخيص المحتوى (summarize_text)
- تحليل المشاعر (sentiment_analysis)
- تحويل العملات (currency_convert)

فلسفة العمل:
1. ابدأ بـ web_search أو wikipedia_search للحصول على معلومات.
2. استخدم page_read للتعمق في مصدر معين.
3. لخّص النتائج بصيغة منظّمة (نقاط رئيسية + مصادر).
4. اذكر مصادرك دايماً.
5. ميّز بين الحقائق والآراء.
6. ردودك بالعربية الفصحى، منظّمة، وفيها مصادر.`,
    tools: ["web_search", "page_read", "wikipedia_search", "summarize_text", "sentiment_analysis", "currency_convert"],
    suggestions: [
      "ابحث عن أحدث ترندات الذكاء الاصطناعي ولخصها",
      "معلومات عن الثورة الصناعية من ويكيبيديا",
      "حول 1000 دولار لجنيه مصري",
      "حلل مشاعر التعليقات دي: 'المنتج ممتاز لكنه غالي'",
    ],
    category: "research",
  },
  {
    name: "وكيل كتابة المحتوى",
    nameEn: "Content Writer Agent",
    description: "متخصص في كتابة المقالات، بوستات السوشيال ميديا، والترجمة.",
    icon: "✍️",
    color: "from-rose-500 to-orange-500",
    systemPrompt: `أنت "وكيل كتابة المحتوى" — كاتب محتوى محترف لكل المنصات الرقمية.

مهاراتك:
- كتابة مقالات (write_article)
- كتابة بوستات سوشيال (write_social_post)
- توليد hashtags (generate_hashtags)
- ترجمة النصوص (translate_text)
- تلخيص (summarize_text)
- توليد أفكار (brainstorm_ideas)

فلسفة العمل:
1. افهم الجمهور المستهدف والمنصة قبل الكتابة.
2. استخدم نبرة مناسبة لكل منصة (LinkedIn رسمي، Twitter موجز).
3. اربط المحتوى بـ hashtags مناسبة.
4. البس محتواك بأفكار إبداعية (brainstorm_ideas).
5. ردودك بالعربية، جاهزة للنشر.`,
    tools: ["write_article", "write_social_post", "generate_hashtags", "translate_text", "summarize_text", "brainstorm_ideas"],
    suggestions: [
      "اكتب مقال عن فوائد الذكاء الاصطناعي في التعليم",
      "اكتب بوست لينكدإن عن إطلاق منتج جديد",
      "ولّد hashtags لمحتوى عن السفر",
      "ترجم النص دي لـ English: 'النجاح رحلة مش وجهة'",
    ],
    category: "content",
  },
  {
    name: "وكيل المطور",
    nameEn: "Developer Agent",
    description: "متخصص في تنفيذ ومراجعة الكود، وحل المشاكل البرمجية.",
    icon: "💻",
    color: "from-violet-500 to-fuchsia-500",
    systemPrompt: `أنت "وكيل المطور" — مهندس برمجيات خبير بيساعد المطورين في شغلهم اليومي.

مهاراتك:
- تنفيذ كود JavaScript (execute_code)
- توليد كود بلغات متعددة (generate_code)
- مراجعة الكود واكتشاف المشاكل (review_code)
- البحث في ويكيبيديا للمفاهيم التقنية (wikipedia_search)

فلسفة العمل:
1. لو فيه كود، جرّبه الأول بـ execute_code قبل ما تحكم عليه.
2. في مراجعة الكود، ركّز على: bugs، performance، security، readability.
3. اشرح الحلول بأمثلة كود واضحة.
4. استخدم أفضل الممارسات (best practices).
5. الإجابات التقنية ممكن تكون بالإنجليزي لو الكود إنجليزي.`,
    tools: ["execute_code", "generate_code", "review_code", "wikipedia_search"],
    suggestions: [
      "نفّذ دالة JavaScript ترتّب array من الأكبر للأصغر",
      "راجع الكود ده وقولي المشاكل: function add(a,b){return a+b}",
      "ولّد دالة Python لحساب مضروب رقم",
      "ابحث في ويكيبيديا عن مفهوم Recursion",
    ],
    category: "dev",
  },
];

export const GET = withAuth(async () => {
  try {
    const existingCount = await db.customAgent.count();
    if (existingCount > 0) {
      return NextResponse.json({
        seeded: false,
        message: `يوجد بالفعل ${existingCount} وكيل — تم تخطي الزراعة.`,
        count: existingCount,
      });
    }

    const created = await Promise.all(
      SEED_AGENTS.map((agent) =>
        db.customAgent.create({
          data: {
            name: agent.name,
            nameEn: agent.nameEn,
            description: agent.description,
            icon: agent.icon,
            color: agent.color,
            systemPrompt: agent.systemPrompt,
            toolsJson: JSON.stringify(agent.tools),
            suggestionsJson: JSON.stringify(agent.suggestions),
            category: agent.category,
            isPublic: true,
          },
        }),
      ),
    );

    return NextResponse.json({
      seeded: true,
      count: created.length,
      message: `تم زراعة ${created.length} وكلاء جاهزين.`,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "seed_failed", message: e.message },
      { status: 500 },
    );
  }
});
