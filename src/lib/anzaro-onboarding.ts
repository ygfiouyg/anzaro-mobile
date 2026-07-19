import type { OnboardingQuestion } from './types'

// ═══════════════════════════════════════════════════════════════════════
// V.17: Improved Onboarding Questions
// ═══════════════════════════════════════════════════════════════════════
// Changes from V.16:
// - All questions in clear Egyptian Arabic (no ambiguous phrasing)
// - Scale questions now have descriptive labels per point (not just 1-5)
// - Choice questions have concrete, relatable options
// - Questions are more personal and engaging
// - Demographic (4) stay first, rest are shuffled per session
// ═══════════════════════════════════════════════════════════════════════

export const ONBOARDING_QUESTIONS: OnboardingQuestion[] = [
  // ── Demographic (always first — prerequisites) ──
  {
    id: 'name',
    question: 'First, what should I call you?',
    questionAr: 'أهلاً! أناديك بإيه؟',
    category: 'demographic',
    inputType: 'text',
  },
  {
    id: 'age',
    question: 'How old are you?',
    questionAr: 'عندك كام سنة؟',
    category: 'demographic',
    inputType: 'text',
  },
  {
    id: 'occupation',
    question: 'What do you do for a living?',
    questionAr: 'بتشتغل إيه؟ (طالب/موظف/ريادي/إلخ)',
    category: 'demographic',
    inputType: 'text',
  },
  {
    id: 'dialect',
    question: 'Which dialect do you prefer me to speak in?',
    questionAr: 'تحب أكلمك بأي لهجة؟',
    category: 'demographic',
    inputType: 'choice',
    options: ['Egyptian (مصري)', 'Khaleeji (خليجي)', 'Levantine (شامي)', 'MSA (فصحى)', 'English'],
    optionsAr: ['مصري', 'خليجي', 'شامي', 'فصحى', 'إنجليزي'],
  },

  // ── Psychological (scale 1-5 with clear labels) ──
  {
    id: 'leadership',
    question: 'In a group, do you naturally take the lead or support from behind?',
    questionAr: 'لما بتكون مع جروب ناس، بتحب تقود الأوامر ولا تفضل تساعد من ورا؟\n(1 = دايماً ورا  •  5 = دايماً قدام)',
    category: 'psychological',
    inputType: 'scale',
    traitKey: 'leadership',
  },
  {
    id: 'stubbornness',
    question: 'Once you decide something, how hard is it to change your mind?',
    questionAr: 'لما تقرر حاجة، بترجع في قرارك بسهولة ولا عنيد؟\n(1 = بغير رأي بسرعة  •  5 = عنيد جداً)',
    category: 'psychological',
    inputType: 'scale',
    traitKey: 'stubbornness',
  },
  {
    id: 'analytical',
    question: 'When facing a problem, do you trust logic or your gut feeling more?',
    questionAr: 'أمام مشكلة، بتثق أكتر في عقلك ولا في إحساسك؟\n(1 = إحساس بالكامل  •  5 = منطق بالكامل)',
    category: 'psychological',
    inputType: 'scale',
    traitKey: 'analytical',
  },
  {
    id: 'emotional',
    question: 'Do decisions in your life usually come from the head or the heart?',
    questionAr: 'قراراتك في حياتك بتيجي من قلبك ولا من دماغك؟\n(1 = قلب خالص  •  5 = دماغ خالص)',
    category: 'psychological',
    inputType: 'scale',
    traitKey: 'emotional',
  },
  {
    id: 'discipline',
    question: 'How strictly do you stick to your daily routines and plans?',
    questionAr: 'بتلتزم بخططك وروتينك اليومي قد إيه؟\n(1 = عفوي/عشوائي  •  5 = منظم جداً)',
    category: 'psychological',
    inputType: 'scale',
    traitKey: 'discipline',
  },
  {
    id: 'sociability',
    question: 'After a long day, do you recharge alone or with people?',
    questionAr: 'بعد يوم طويل ومتعب، بتحب تشحن طاقتك لوحدك ولا مع ناس؟\n(1 = لوحدي دايماً  •  5 = مع ناس دايماً)',
    category: 'psychological',
    inputType: 'scale',
    traitKey: 'sociability',
  },
  {
    id: 'humor',
    question: 'How much do you appreciate humor even in serious moments?',
    questionAr: 'بتحب النكتة والمرح حتى في اللحظات الجادة؟\n(1 = بكره النكت وقت الجد  •  5 = المرح في كل وقت)',
    category: 'psychological',
    inputType: 'scale',
    traitKey: 'humor',
  },

  // ── Drivers (choice — concrete scenarios) ──
  {
    id: 'driver_success',
    question: 'What drives you more: building something lasting, or winning in the moment?',
    questionAr: 'إيه اللي بيحركك أكتر في الحياة؟',
    category: 'driver',
    inputType: 'choice',
    options: ['Building something lasting', 'Winning in the moment', 'Both equally'],
    optionsAr: ['أبني حاجة تدوم لسنوات', 'أكسب اللحظة دي واخلاص', 'الاتنين بنفس القدر'],
  },
  {
    id: 'driver_fear',
    question: 'What is the one thing you never want to feel?',
    questionAr: 'إيه أكتر حاجة بتخاف تحس بيها؟',
    category: 'driver',
    inputType: 'choice',
    options: ['Being stuck / no progress', 'Being misunderstood', 'Letting people down', 'Losing control'],
    optionsAr: ['أحس إني مكان روحي ومش بتقدم', 'محدش يفهمني غلط', 'أخذّل ناس بتعتمد عليّ', 'أخسر السيطرة على حياتي'],
  },
  {
    id: 'trigger_stress',
    question: 'When stressed, what helps you most?',
    questionAr: 'لما بتبقى مضغوط ومهموم، إيه اللي بيريّحك أكتر؟',
    category: 'driver',
    inputType: 'choice',
    options: ['Silence & space', 'Talking it out', 'Music / Quran', 'Action & movement'],
    optionsAr: ['أقعد لوحدي في سكتة', 'أكلم حد قريب ليّ', 'أسمع قرآن أو موسيقى', 'أتحرك وأعمل أي حاجة'],
  },

  // ── Preferences (choice — practical) ──
  {
    id: 'preference_communication',
    question: 'How do you like to receive information?',
    questionAr: 'لما بشرحلك حاجة، تحب أقولها إزاي؟',
    category: 'preference',
    inputType: 'choice',
    options: ['Short & direct', 'Detailed & explained', 'Visual / examples', 'Story-driven'],
    optionsAr: ['كلام قصير ومباشر بدون لف', 'تفاصيل كاملة وشرح وافي', 'أمثلة عملية من الواقع', 'عبر قصة أو سيناريو'],
  },
  {
    id: 'preference_morning',
    question: 'Are you a morning person or a night person?',
    questionAr: 'إنت من الناس بتاعة الصبح ولا الليل؟',
    category: 'preference',
    inputType: 'choice',
    options: ['Early morning', 'Late night', 'Afternoon peak', 'Flexible'],
    optionsAr: ['بدري الصبح (فجر)', 'آخر الليل (سهر)', 'الضهر (بعد الظهر)', 'مرن — أي وقت'],
  },
  {
    id: 'preference_tone',
    question: 'How do you want me to talk to you?',
    questionAr: 'تحب أتعامل معاك بإيه؟',
    category: 'preference',
    inputType: 'choice',
    options: ['Big brother/sister', 'Formal & respectful', 'Casual friend', 'Strict & honest'],
    optionsAr: ['أخ/أخت كبير — ودّي وحازم', 'رسمي ومحترم', 'صاحب عادي — مرحو', 'صريح وحازم بدون لف'],
  },

  // ── Open-ended (text) ──
  {
    id: 'goal_3months',
    question: 'If we worked together for 3 months, what would success look like for you?',
    questionAr: 'لو شغلنا مع بعض 3 شهور، النجاح شكله إيه عندك؟\n(اكتب بالراحة — مفيش إجابة غلط)',
    category: 'driver',
    inputType: 'text',
  },
  {
    id: 'anything_else',
    question: 'Anything else you want Anzaro to know about you?',
    questionAr: 'في أي حاجة تاني عايز آنزارو يعرفها عنك؟\n(هوايات، مخاوف، أحلام — أو سيبها فاضية)',
    category: 'preference',
    inputType: 'text',
  },
]
