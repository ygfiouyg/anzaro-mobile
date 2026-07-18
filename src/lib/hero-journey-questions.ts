// ═══════════════════════════════════════════════════════════════════
// ANZARO V.101 — THE HERO'S JOURNEY: 20-QUESTION IDENTITY WIZARD
// Immersive RPG scenario-based questions, NOT traditional quizzes.
// Tests: Money/Business (risk, wealth blocks, execution) +
//        Self-Dev/Relationships (dark traits, manipulation radar, EQ)
// ═══════════════════════════════════════════════════════════════════

export interface IdentityQuestion {
  id: string
  dimension: 'money' | 'power' | 'self_dev' | 'relationships' | 'dark_traits' | 'eq' | 'risk' | 'execution'
  scenario: string        // The RPG scenario (Arabic)
  scenarioEn: string      // English version
  options: {
    text: string          // Arabic option text
    textEn: string        // English
    scores: Record<string, number>  // Trait scores this option grants
    archetype?: string    // Archetype hint
  }[]
  conflictDetection?: string  // If this answer conflicts with a previous one, trigger this question ID
}

export const HERO_JOURNEY_QUESTIONS: IdentityQuestion[] = [
  // ─── Q1: Risk Tolerance (Money) ───
  {
    id: 'q1_risk_money',
    dimension: 'risk',
    scenario: 'أنت واقف قدام صفقة بـ 500 ألف جنيه. المستشار بتاعك بيقول 70% فرصة نجاح، 30% خسارة كاملة. آخر موعد للقرار: 60 ثانية. الصفقة دي هتغير حياتك لو نجحت. بتدوس Confirm ولا Cancel؟',
    scenarioEn: 'A 500K deal. 70% success, 30% total loss. 60 seconds to decide. Life-changing if it hits. Confirm or Cancel?',
    options: [
      { text: 'دوس Confirm — الريسك جزء من اللعبة', textEn: 'Confirm — risk is the game', scores: { riskTolerance: 90, executionSpeed: 85, impulsiveness: 60 }, archetype: 'gambler' },
      { text: 'دوس Cancel — الفلوس مش بتاعتة لو هتروح في ثانية', textEn: 'Cancel — money shouldn\'t vanish in seconds', scores: { riskTolerance: 20, caution: 85, preservation: 80 }, archetype: 'preserver' },
      { text: 'ألوّن على المستشار وأطلب تفاصيل أكتر قبل ما أقرر', textEn: 'Call advisor for more details first', scores: { riskTolerance: 45, analyticalDepth: 85, caution: 60 }, archetype: 'analyst' },
      { text: 'أعمل الجزء اللي مفيهوش ريスク وأسيب الباقي', textEn: 'Hedge — take the safe portion only', scores: { riskTolerance: 55, strategicThinking: 80, adaptability: 70 }, archetype: 'strategist' },
    ],
  },
  // ─── Q2: Wealth Block (Money) ───
  {
    id: 'q2_wealth_block',
    dimension: 'money',
    scenario: 'ربنا رزقك فجأة بمليون جنيه. مفيش شروط، مفيش ديون. أول حاجة هتعملها إيه — بصراحة، مش اللي بتقوله للناس؟',
    scenarioEn: 'You suddenly receive 1M. No strings. First thing you ACTUALLY do — not what you tell people?',
    options: [
      { text: 'أحطه في استثمار آمن وأكبره ببطء', textEn: 'Safe investment, grow slowly', scores: { wealthMindset: 70, patience: 80, preservation: 75 }, archetype: 'builder' },
      { text: 'أبدأ المشروع اللي بحلم بيه من سنين', textEn: 'Start the dream project', scores: { wealthMindset: 85, ambition: 90, executionSpeed: 75 }, archetype: 'visionary' },
      { text: 'أوزّعه: نصف استثمار، ربع مشروع، ربع حياة', textEn: 'Split: half invest, quarter project, quarter life', scores: { wealthMindset: 80, strategicThinking: 85, balance: 80 }, archetype: 'strategist' },
      { text: 'أصرفه على حاجات كنت عايزها — حياة واحدة', textEn: 'Spend on things I wanted — one life', scores: { wealthMindset: 30, hedonism: 75, presentFocus: 85 }, archetype: 'hedonist' },
    ],
  },
  // ─── Q3: Execution Speed ───
  {
    id: 'q3_execution',
    dimension: 'execution',
    scenario: 'عندك فكرة مشروع ممتازة. كتبتها على ورقة. الليلة دي بس، الإلهام شغال. الصبح هتصحي وتعمل إيه؟',
    scenarioEn: 'Great project idea on paper. Tonight the inspiration is flowing. Tomorrow morning you wake up and...?',
    options: [
      { text: 'أبدأ التنفيذ فوراً — أول ساعة في اليوم للفكرة', textEn: 'Execute immediately — first hour for the idea', scores: { executionSpeed: 95, ambition: 80, impulsiveness: 50 }, archetype: 'executor' },
      { text: 'أعمل خطة مفصلة الأول، بعدين أبدأ خلال أسبوع', textEn: 'Detailed plan first, start within a week', scores: { executionSpeed: 50, analyticalDepth: 80, patience: 70 }, archetype: 'planner' },
      { text: 'أبحث لو حد عملها قبل كده وأشوف المنافسة', textEn: 'Research if someone did it before', scores: { executionSpeed: 35, analyticalDepth: 90, caution: 70 }, archetype: 'researcher' },
      { text: 'أسيبها تتخمر — أفضل الأفكار بتيجي بالصبر', textEn: 'Let it marinate — best ideas come with patience', scores: { executionSpeed: 20, patience: 85, intuition: 70 }, archetype: 'incubator' },
    ],
  },
  // ─── Q4: Dark Trait — Manipulation Radar ───
  {
    id: 'q4_manipulation',
    dimension: 'dark_traits',
    scenario: 'شريكك في الشغل غلط ومش عايز يعترف. لو فضحتة قدام المدير، هتاخد ترقية هو مرشح ليها. مفيش حد هيعرف إنك كنت عارف. بتعمل إيه؟',
    scenarioEn: 'Your colleague made a mistake and won\'t admit it. Exposing him gets you his promotion. Nobody knows you knew. What do you do?',
    options: [
      { text: 'أفضحه — الفرصة بتاعتي وأنا شاطر', textEn: 'Expose him — my opportunity', scores: { machiavellianism: 85, ambition: 80, ruthlessness: 75 }, archetype: 'operator' },
      { text: 'أسيبه — مش هاجي نجاحي على حساب غلط حد تاني', textEn: 'Leave it — won\'t build success on others\' mistakes', scores: { machiavellianism: 15, integrity: 90, empathy: 75 }, archetype: 'noble' },
      { text: 'أكلمه على جنب وأخليه يعترف بنفسه', textEn: 'Talk to him privately, let him confess', scores: { machiavellianism: 40, emotionalIntelligence: 85, leadership: 80 }, archetype: 'diplomat' },
      { text: 'أستغل المعلومة بعدين في الوقت المناسب', textEn: 'Use the info later at the right time', scores: { machiavellianism: 75, strategicThinking: 85, patience: 70 }, archetype: 'chessmaster' },
    ],
  },
  // ─── Q5: Emotional Intelligence ───
  {
    id: 'q5_eq',
    dimension: 'eq',
    scenario: 'صاحبك القريب بيمر بأزمة نفسية صعبة. بيتصل بيكى الساعة 3 الفجر. أنت عندك اجتماع مصيري الصبح الساعة 8. بترد ولا تسيبها؟',
    scenarioEn: 'Close friend in psychological crisis. Calls crying at 3 AM. You have a career-defining meeting at 8 AM. Answer or ignore?',
    options: [
      { text: 'أرد وأفضل معاه لحد ما يهدى — الناس أهم من أي اجتماع', textEn: 'Answer and stay until calm', scores: { empathy: 95, selfSacrifice: 80, emotionalIntelligence: 85 }, archetype: 'caretaker' },
      { text: 'أرد وأكلمه 10 دقايق وأرجعه بكرة', textEn: 'Answer, talk 10 min, reschedule', scores: { empathy: 65, balance: 80, emotionalIntelligence: 75 }, archetype: 'balancer' },
      { text: 'ما أردش — بكرة هكون أحسن له وللي', textEn: 'Don\'t answer — better for both tomorrow', scores: { empathy: 25, pragmatism: 80, selfFocus: 75 }, archetype: 'pragmatist' },
      { text: 'أبعتله رسالة: "أنا معاك، بكرة الصبح هكلمك"', textEn: 'Text: "I\'m here, will call in morning"', scores: { empathy: 55, emotionalIntelligence: 70, boundaries: 80 }, archetype: 'boundary-setter' },
    ],
  },
  // ─── Q6: Power & Leadership ───
  {
    id: 'q6_power',
    dimension: 'power',
    scenario: 'اترقيت وبتقود فريق 50 شخص. أول قرار: بتغيّر النظام اللي كان شغال من 10 سنين (وبيكسل بس الناس متعودة عليه) ولا بتسيبه وتعدّل بالتدريج؟',
    scenarioEn: 'Promoted to lead 50 people. First decision: change the 10-year system (broken but familiar) or gradual adjustment?',
    options: [
      { text: 'أغيّره فوراً — التغيير الجذري بيفتح باب جديد', textEn: 'Change immediately — radical opens new doors', scores: { leadership: 90, riskTolerance: 75, executionSpeed: 85 }, archetype: 'disruptor' },
      { text: 'بعدّل بالتدريج — الناس بتموت على التغيير المفاجئ', textEn: 'Gradual — people resist sudden change', scores: { leadership: 70, empathy: 65, strategicThinking: 80 }, archetype: 'reformer' },
      { text: 'بجمع الفريق وأخليهم يقرروا معايا', textEn: 'Gather team, decide together', scores: { leadership: 75, collaboration: 90, emotionalIntelligence: 80 }, archetype: 'facilitator' },
      { text: 'بسيبه زي ما هو وأركز على نتايج تانية', textEn: 'Leave it, focus on other results', scores: { leadership: 40, avoidance: 70, pragmatism: 60 }, archetype: 'avoider' },
    ],
  },
  // ─── Q7: Self-Development ───
  {
    id: 'q7_self_dev',
    dimension: 'self_dev',
    scenario: 'لقيت كتاب/كورس بيشرح مهارة هتضاعف دخلك. بس محتاج 3 ساعات يومياً لمدة شهر. هتضحي بإيه عشان تاخده؟',
    scenarioEn: 'Found a course that doubles your income. Needs 3hrs/day for a month. What do you sacrifice?',
    options: [
      { text: 'النوم — بنام 4 ساعات بدل 7', textEn: 'Sleep — 4hrs instead of 7', scores: { discipline: 90, ambition: 85, selfSacrifice: 75 }, archetype: 'grinder' },
      { text: 'السوشيال ميديا والترفيه', textEn: 'Social media and entertainment', scores: { discipline: 75, pragmatism: 80, balance: 70 }, archetype: 'optimizer' },
      { text: 'النوم والسوشيال والعايلة — كله بيتأجل', textEn: 'Everything — sleep, social, family', scores: { discipline: 95, ambition: 90, selfSacrifice: 85 }, archetype: 'obsessive' },
      { text: 'مش هضحي بحاجة — هلاقي وقت من غير ما أقطع حاجة', textEn: 'Won\'t sacrifice — find time without cutting', scores: { discipline: 40, optimism: 75, balance: 65 }, archetype: 'hoper' },
    ],
  },
  // ─── Q8: Relationship Authenticity ───
  {
    id: 'q8_relationships',
    dimension: 'relationships',
    scenario: 'أنت في علاقة. الطرف التاني بيحبك جداً بس في عيب واحد بيقهرّك: بيكذب كذبات صغيرة باستمرار (مش خيانة، بس كذب). بتقول إيه؟',
    scenarioEn: 'In a relationship. Partner loves you deeply but constantly tells small lies (not infidelity, just lying). What do you say?',
    options: [
      { text: 'مواجهة مباشرة: "الكذب مش مقبول، حتى لو صغير"', textEn: 'Direct confrontation: "Lying isn\'t acceptable"', scores: { directness: 90, boundaries: 85, integrity: 80 }, archetype: 'confronter' },
      { text: 'أسيبه — الكذب الصغير جزء من البشر', textEn: 'Leave it — small lies are human', scores: { tolerance: 75, avoidance: 60, pragmatism: 65 }, archetype: 'accepter' },
      { text: 'أحاول أفهم ليه بيكذب — السبب أهم من الفعل', textEn: 'Understand why — cause matters more than act', scores: { empathy: 85, emotionalIntelligence: 90, patience: 75 }, archetype: 'healer' },
      { text: 'أبدأ أجهز للانسحاب بهدوء', textEn: 'Start quietly preparing to leave', scores: { selfPreservation: 80, detachment: 75, strategicThinking: 65 }, archetype: 'withdrawer' },
    ],
  },
  // ─── Q9: Dark Trait — Narcissism Check ───
  {
    id: 'q9_narcissism',
    dimension: 'dark_traits',
    scenario: 'عملت مشروع نجح نجاح كبير. كل الناس بتمدحك. واحد بس قال رأيه الناقد بصراحة. رد فعلك الداخلي (مش اللي بتقوله)؟',
    scenarioEn: 'Project succeeded hugely. Everyone praises you. One person gives honest criticism. Your INTERNAL reaction?',
    options: [
      { text: '"مين ده اللي بيتكلم؟ أنا نجحت وهو لأ"', textEn: '"Who is this? I succeeded, he didn\'t"', scores: { narcissism: 85, defensiveness: 75, ego: 90 }, archetype: 'narcissist' },
      { text: 'بسمع وأفكر — الرأي الناقد بيفتح عيني', textEn: 'Listen and think — criticism opens eyes', scores: { narcissism: 20, humility: 85, growth: 80 }, archetype: 'learner' },
      { text: 'بسمع بس بكرة بنسى — المدح هو اللي بيفضل', textEn: 'Listen but forget by tomorrow', scores: { narcissism: 50, selectiveAttention: 70, ego: 60 }, archetype: 'selector' },
      { text: 'بزعل جوه بس ما بينفعش حد', textEn: 'Hurt inside but show nothing', scores: { narcissism: 60, suppression: 80, ego: 65 }, archetype: 'suppressor' },
    ],
  },
  // ─── Q10: Conflict & Negotiation ───
  {
    id: 'q10_conflict',
    dimension: 'power',
    scenario: 'في مفاوضات على صفقة. الطرف التاني بيلعب على الوقت وبيستفزك. عندك 3 خيارات. بتختار إيه؟',
    scenarioEn: 'In negotiations. Other side plays for time and provokes you. 3 options. Which?',
    options: [
      { text: 'أضرب الطاولة وأمشي — عندي بدائل', textEn: 'Slam table and leave — I have alternatives', scores: { dominance: 85, riskTolerance: 70, ego: 75 }, archetype: 'dominator' },
      { text: 'أضحك وأسيبه يحس إنه مسيطر، بعدين أضرب صفقتي', textEn: 'Smile, let him feel in control, then strike', scores: { strategicThinking: 90, patience: 80, machiavellianism: 65 }, archetype: 'tactician' },
      { text: 'أواجه الاستفز مباشرة وبقول حدودي', textEn: 'Confront provocation directly, set boundaries', scores: { directness: 85, boundaries: 80, courage: 75 }, archetype: 'boundary-holder' },
      { text: 'أطلب وساطة طرف ثالث', textEn: 'Request third-party mediation', scores: { collaboration: 75, caution: 70, diplomacy: 80 }, archetype: 'mediator' },
    ],
  },
  // ─── Q11-20: More dimensions... ───
  // Q11: Fear of Success
  {
    id: 'q11_fear_success',
    dimension: 'self_dev',
    scenario: 'أنت على بعد خطوة من نجاح كنت تحلم بيه. فجأة حسيت بخوف غريب — "لو نجحت، مين أنا بجد؟". بتتعامل مع الخوف ده إزاي؟',
    scenarioEn: 'One step from your dream success. Suddenly fear: "If I succeed, who am I really?" How do you handle it?',
    options: [
      { text: 'بندفع قدام — الخوف دليل إني في الطريق الصح', textEn: 'Push forward — fear means right path', scores: { courage: 90, selfAwareness: 75, executionSpeed: 80 }, archetype: 'warrior' },
      { text: 'بأخذ وقت أفهم الخوف — في حاجة جوه بتقول لي حاجة', textEn: 'Take time to understand the fear', scores: { selfAwareness: 90, introspection: 85, patience: 70 }, archetype: 'introspector' },
      { text: 'بأجل الخطوة بكرة — مش وقت النجاح دلوقتي', textEn: 'Postpone — not the right time', scores: { avoidance: 80, fearOfSuccess: 75, caution: 60 }, archetype: 'postponer' },
      { text: 'بحاول أكون طبيعي وأكمل زي ما ماكنش حصل حاجة', textEn: 'Act normal, continue as if nothing happened', scores: { suppression: 75, denial: 70, pragmatism: 50 }, archetype: 'denier' },
    ],
  },
  // Q12: Loyalty vs Self-Interest
  {
    id: 'q12_loyalty',
    dimension: 'relationships',
    scenario: 'صاحبك القريب عرض عليك فرصة شغل ممتازة في شركة هو شغال فيها. بس لو خدت الفرصة، هيتمسح هو من المشروع. مفيش حد هيعرف إنك كنت عارف. بتعمل إيه؟',
    scenarioEn: 'Close friend offers you a great job opportunity at his company. But if you take it, he gets removed. Nobody knows you knew. What do you do?',
    options: [
      { text: 'بأخذ الفرصة — هو لازم يتأقلم', textEn: 'Take it — he needs to adapt', scores: { selfInterest: 85, ruthlessness: 70, ambition: 75 }, archetype: 'self-server' },
      { text: 'بأرفض — الصداقة أهم من أي فرصة', textEn: 'Refuse — friendship > opportunity', scores: { loyalty: 90, integrity: 80, selfSacrifice: 70 }, archetype: 'loyalist' },
      { text: 'بكلمه الأول وأخليه هو يقرر', textEn: 'Talk to him first, let him decide', scores: { loyalty: 75, transparency: 85, emotionalIntelligence: 80 }, archetype: 'transparent' },
      { text: 'بأخذها بس بأحاول أحميه من جنب', textEn: 'Take it but try to protect him', scores: { selfInterest: 65, guilt: 70, loyalty: 50 }, archetype: 'guilt-taker' },
    ],
  },
  // Q13: Creative vs Analytical
  {
    id: 'q13_thinking_style',
    dimension: 'self_dev',
    scenario: 'عندك مشكلة معقدة. بتحلها إزاي؟',
    scenarioEn: 'Complex problem. How do you solve it?',
    options: [
      { text: 'بفككها لأجزاء وأحلل كل جزء لوحده', textEn: 'Break into parts, analyze each', scores: { analyticalDepth: 90, systematic: 85, logic: 80 }, archetype: 'analyst' },
      { text: 'بحس الحل قبل ما أفكر فيه', textEn: 'Feel the solution before thinking', scores: { intuition: 85, creativity: 80, emotionalIntelligence: 70 }, archetype: 'intuitive' },
      { text: 'بأخد ورقة وقلم وأرسم الخريطة كلها', textEn: 'Paper and pen, draw the full map', scores: { visualThinking: 85, systematic: 75, analyticalDepth: 70 }, archetype: 'mapper' },
      { text: 'بكلم ناس تانية وأسمع آراء مختلفة', textEn: 'Talk to others, hear different views', scores: { collaboration: 85, socialIntelligence: 80, openness: 75 }, archetype: 'collaborator' },
    ],
  },
  // Q14: Stress Response
  {
    id: 'q14_stress',
    dimension: 'eq',
    scenario: 'كل حاجة بتقع في نفس الوقت: ديون، مشاكل عيلية، شغل ضاغط. أنت في قمة الضغط. أول حاجة بتعملها؟',
    scenarioEn: 'Everything collapses at once: debts, family issues, work pressure. Peak stress. First thing you do?',
    options: [
      { text: 'بأبعد عن الكل ساعة وأفكر بهدوء', textEn: 'Step away for an hour, think calmly', scores: { emotionalRegulation: 85, selfAwareness: 80, isolation: 60 }, archetype: 'isolator' },
      { text: 'ببدأ بحل أكبر مشكلة وأكمل بالترتيب', textEn: 'Start with biggest problem, go in order', scores: { executionSpeed: 80, analyticalDepth: 75, stressTolerance: 85 }, archetype: 'tackler' },
      { text: 'بكلم حد قريب وأفرغ شوية', textEn: 'Talk to someone close, vent', scores: { emotionalExpression: 80, vulnerability: 75, socialSupport: 85 }, archetype: 'venter' },
      { text: 'بأكل/أنام/أحرق طاقة جسدية الأول', textEn: 'Eat/sleep/burn physical energy first', scores: { physicalCoping: 80, avoidance: 55, selfCare: 70 }, archetype: 'physical-coper' },
    ],
  },
  // Q15: Legacy & Meaning
  {
    id: 'q15_legacy',
    dimension: 'self_dev',
    scenario: 'بعد 20 سنة، بتمشي في الشارع وبتسمع الناس بيتكلموا عنك. بتحب تسمع إيه؟',
    scenarioEn: '20 years later, walking down the street, you hear people talking about you. What do you want to hear?',
    options: [
      { text: '"ده أنجح رجل/ست في مجاله"', textEn: '"The most successful person in their field"', scores: { ambition: 85, legacy: 75, ego: 70 }, archetype: 'achiever' },
      { text: '"ده أنقى وأطيب قلب قابلته"', textEn: '"The purest, kindest heart I\'ve met"', scores: { empathy: 90, legacy: 80, spirituality: 65 }, archetype: 'saint' },
      { text: '"ده أذكى واحد اتعاملت معاه"', textEn: '"The smartest person I\'ve dealt with"', scores: { intellectual: 85, ego: 75, analyticalDepth: 80 }, archetype: 'genius' },
      { text: '"ده غير حياة ناس كتير بعمله"', textEn: '"Changed many lives through their work"', scores: { impact: 90, purpose: 85, altruism: 75 }, archetype: 'changemaker' },
    ],
  },
  // Q16: Revenge vs Forgiveness
  {
    id: 'q16_revenge',
    dimension: 'dark_traits',
    scenario: 'حد خد حقك ودمرك مادي. بعد سنين، قدرت تاخد حقك بالقانون. بس تقدر كمان تدمره شخصياً من غير ما حد يعرف. بتعمل إيه؟',
    scenarioEn: 'Someone wronged and ruined you financially. Years later, you can legally reclaim rights AND destroy them personally without anyone knowing. What do you do?',
    options: [
      { text: 'باخد حقي بالقانون وبسيبه — ربنا ينتقم منه', textEn: 'Legal rights only, leave the rest', scores: { forgiveness: 75, integrity: 80, restraint: 85 }, archetype: 'just' },
      { text: 'باخد حقي وبدمّره — اللي كسرني لازم يتكسر', textEn: 'Rights + destroy — what goes around', scores: { vindictiveness: 85, ruthlessness: 80, machiavellianism: 75 }, archetype: 'avenger' },
      { text: 'باخد حقي وبحاول أصلّح اللي بيننا', textEn: 'Rights + try to reconcile', scores: { forgiveness: 60, diplomacy: 80, idealism: 70 }, archetype: 'peacemaker' },
      { text: 'باسامحه وبسيب حقي — مش عايز أركز على الماضي', textEn: 'Forgive, leave rights — don\'t focus on past', scores: { forgiveness: 90, detachment: 80, spirituality: 75 }, archetype: 'sage' },
    ],
  },
  // Q17: Trust & Vulnerability
  {
    id: 'q17_trust',
    dimension: 'relationships',
    scenario: 'أنت في قمة ضعفك النفسي. محتاج تتكلم مع حد. مين بتختار؟',
    scenarioEn: 'At your psychological weakest. Need to talk to someone. Who do you choose?',
    options: [
      { text: 'العيلة — هم الأساس', textEn: 'Family — the foundation', scores: { familyBond: 85, trust: 75, vulnerability: 70 }, archetype: 'family-oriented' },
      { text: 'صاحب واحد مقرب بس', textEn: 'One close friend only', scores: { selectiveTrust: 80, vulnerability: 75, loyalty: 70 }, archetype: 'selective' },
      { text: 'معالج نفسي — حيادي ومحترف', textEn: 'Therapist — neutral and professional', scores: { pragmatism: 80, selfCare: 85, emotionalIntelligence: 75 }, archetype: 'rational-seeker' },
      { text: 'حد في النت ما يعرفنيش — الأمان في البعد', textEn: 'Anonymous online person', scores: { anonymity: 85, avoidance: 60, fearOfJudgment: 75 }, archetype: 'anonymous' },
    ],
  },
  // Q18: Money & Identity
  {
    id: 'q18_money_identity',
    dimension: 'money',
    scenario: 'لو فقدت كل فلوسك بكره — بتموت مين؟',
    scenarioEn: 'If you lost all your money tomorrow — who would you be?',
    options: [
      { text: 'نفس الشخص — أنا مش فلوسي', textEn: 'Same person — I\'m not my money', scores: { selfWorth: 85, identity: 80, spirituality: 65 }, archetype: 'grounded' },
      { text: 'واحد محتاج يبدأ من الصفر تاني', textEn: 'Someone who needs to start from zero', scores: { resilience: 80, pragmatism: 75, acceptance: 70 }, archetype: 'resetter' },
      { text: 'واحد ضايع — فلوسي هي هويتي', textEn: 'Lost — money is my identity', scores: { materialIdentity: 85, ego: 75, fearOfLoss: 80 }, archetype: 'materialist' },
      { text: 'واحد اتعلم درس غالي وهيستفيد منه', textEn: 'Someone who learned an expensive lesson', scores: { growth: 85, wisdom: 80, resilience: 75 }, archetype: 'student' },
    ],
  },
  // Q19: Authenticity vs Social Mask
  {
    id: 'q19_authenticity',
    dimension: 'self_dev',
    scenario: 'أنت في حفلة كلها ناس مشهورة وأقوياء. بتحس إنك مختلف عنهم تماماً. بتتصرف إزاي؟',
    scenarioEn: 'At a party full of famous/powerful people. You feel completely different. How do you act?',
    options: [
      { text: 'بكون على طبيعتي — اللي هيحبني يحبني', textEn: 'Be myself — take me or leave me', scores: { authenticity: 90, selfConfidence: 85, nonconformity: 80 }, archetype: 'authentic' },
      { text: 'بتمثل أدوارهم عشان أندمج', textEn: 'Play their game to fit in', scores: { adaptability: 75, socialIntelligence: 80, masking: 70 }, archetype: 'chameleon' },
      { text: 'بفضل صامت وأ observation', textEn: 'Stay quiet, observe', scores: { observation: 85, caution: 75, introversion: 80 }, archetype: 'observer' },
      { text: 'بمشي — مش مكاني', textEn: 'Leave — not my place', scores: { selfRespect: 80, avoidance: 65, boundaries: 75 }, archetype: 'leaver' },
    ],
  },
  // Q20: The Final Mirror
  {
    id: 'q20_final_mirror',
    dimension: 'self_dev',
    scenario: 'آخر سؤال. بصّ في المراية. لو الشخص اللي قدامك ممكن يقول حاجة واحدة بس لك، بتتمنى تسمع إيه؟',
    scenarioEn: 'Last question. Look in the mirror. If the person looking back could say one thing to you, what do you wish to hear?',
    options: [
      { text: '"أنا فخور بيك"', textEn: '"I\'m proud of you"', scores: { needForApproval: 75, selfWorth: 70, growth: 65 }, archetype: 'approval-seeker' },
      { text: '"أنت أقوى مما بتفتكر"', textEn: '"You\'re stronger than you think"', scores: { hiddenStrength: 80, selfDoubt: 70, resilience: 75 }, archetype: 'hidden-strength' },
      { text: '"أنت بجد على الطريق الصح"', textEn: '"You\'re genuinely on the right path"', scores: { needForValidation: 70, purpose: 80, direction: 75 }, archetype: 'path-seeker' },
      { text: '"أسامحك"', textEn: '"I forgive you"', scores: { guilt: 80, selfCompassion: 70, healing: 85 }, archetype: 'guilt-bearer' },
    ],
  },
]

// ─── Conflict Detection Rules ───
// If a user's answer conflicts with a previous answer, trigger a follow-up
export const CONFLICT_RULES: Record<string, { conflictsWith: string; followUpQuestion: IdentityQuestion }> = {
  // If Q1 (high risk) but Q2 (safe investment), trigger conflict resolution
  q2_safe_investor: {
    conflictsWith: 'q1_gambler',
    followUpQuestion: {
      id: 'conflict_1_risk_contradiction',
      dimension: 'risk',
      scenario: 'لحظة — في السؤال الأول قولت إنك بتاخد ريسك 70/30، بس في التاني فضلت الاستثمار الآمن. صراحةً، إيه اللي بيحصل جواك لما تواجه القرار بجد؟',
      scenarioEn: 'Wait — Q1 you took the 70/30 risk, but Q2 you preferred safe investment. Honestly, what happens inside you when facing a real decision?',
      options: [
        { text: 'الريسك في النظري سهل، في العملي بختلف', textEn: 'Risk in theory is easy, in practice I differ', scores: { selfAwareness: 85, theoryPracticeGap: 80, honesty: 90 } },
        { text: 'بتقول كلام وبتعمل كلام تاني — مش واخد بالي', textEn: 'Say one thing, do another — not aware', scores: { selfAwareness: 20, inconsistency: 85 } },
        { text: 'كل قرار ليه ظروفه — مش تناقض', textEn: 'Each decision has context — not contradiction', scores: { nuance: 80, contextual: 75, selfAwareness: 70 } },
      ],
    },
  },
}
