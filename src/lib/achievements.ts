// ═══════════════════════════════════════════════════════════
// تعريفات الإنجازات — Gamification Achievement Definitions
// ═══════════════════════════════════════════════════════════

export interface AchievementDef {
  key: string;
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  icon: string;
  category: 'general' | 'chat' | 'learning' | 'creative' | 'social';
  points: number;
  requirement: number;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { key: 'first_chat', titleAr: 'البداية', titleEn: 'The Beginning', descriptionAr: 'أرسل أول رسالة', descriptionEn: 'Send your first message', icon: '💬', category: 'chat', points: 10, requirement: 1 },
  { key: 'chat_10', titleAr: 'مجتماع', titleEn: 'Social', descriptionAr: 'أرسل 10 رسائل', descriptionEn: 'Send 10 messages', icon: '🗣️', category: 'chat', points: 25, requirement: 10 },
  { key: 'chat_50', titleAr: 'ثرثار', titleEn: 'Chatterbox', descriptionAr: 'أرسل 50 رسالة', descriptionEn: 'Send 50 messages', icon: '📢', category: 'chat', points: 50, requirement: 50 },
  { key: 'quiz_1', titleAr: 'طالب مجتهد', titleEn: 'Eager Student', descriptionAr: 'أكمل أول اختبار', descriptionEn: 'Complete your first quiz', icon: '📝', category: 'learning', points: 15, requirement: 1 },
  { key: 'quiz_5', titleAr: 'خبير الاختبارات', titleEn: 'Quiz Master', descriptionAr: 'أكمل 5 اختبارات', descriptionEn: 'Complete 5 quizzes', icon: '🏆', category: 'learning', points: 40, requirement: 5 },
  { key: 'doc_1', titleAr: 'المنتج', titleEn: 'Producer', descriptionAr: 'أنشئ أول مستند', descriptionEn: 'Create your first document', icon: '📄', category: 'creative', points: 15, requirement: 1 },
  { key: 'doc_5', titleAr: 'الكاتب', titleEn: 'Writer', descriptionAr: 'أنشئ 5 مستندات', descriptionEn: 'Create 5 documents', icon: '✍️', category: 'creative', points: 35, requirement: 5 },
  { key: 'image_1', titleAr: 'الفنان', titleEn: 'Artist', descriptionAr: 'أنشئ أول صورة', descriptionEn: 'Create your first image', icon: '🎨', category: 'creative', points: 15, requirement: 1 },
  { key: 'mindmap_1', titleAr: 'المفكر', titleEn: 'Thinker', descriptionAr: 'أنشئ أول خريطة ذهنية', descriptionEn: 'Create your first mind map', icon: '🧠', category: 'learning', points: 15, requirement: 1 },
  { key: 'code_1', titleAr: 'المبرمج', titleEn: 'Programmer', descriptionAr: 'شغّل أول كود', descriptionEn: 'Execute your first code', icon: '💻', category: 'general', points: 15, requirement: 1 },
  { key: 'streak_3', titleAr: 'منتظم', titleEn: 'Consistent', descriptionAr: 'سلسلة 3 أيام', descriptionEn: '3 day streak', icon: '🔥', category: 'general', points: 30, requirement: 3 },
  { key: 'streak_7', titleAr: 'ملتزم', titleEn: 'Dedicated', descriptionAr: 'سلسلة 7 أيام', descriptionEn: '7 day streak', icon: '⭐', category: 'general', points: 60, requirement: 7 },
  { key: 'streak_30', titleAr: 'أسطوري', titleEn: 'Legendary', descriptionAr: 'سلسلة 30 يوم', descriptionEn: '30 day streak', icon: '👑', category: 'general', points: 200, requirement: 30 },
  { key: 'level_5', titleAr: 'محترف', titleEn: 'Professional', descriptionAr: 'وصل للمستوى 5', descriptionEn: 'Reach level 5', icon: '🎯', category: 'general', points: 100, requirement: 5 },
  { key: 'level_10', titleAr: 'خبير', titleEn: 'Expert', descriptionAr: 'وصل للمستوى 10', descriptionEn: 'Reach level 10', icon: '💎', category: 'general', points: 250, requirement: 10 },
];

// Map action type to relevant achievement keys
export const ACTION_ACHIEVEMENT_MAP: Record<string, string[]> = {
  chat: ['first_chat', 'chat_10', 'chat_50'],
  quiz: ['quiz_1', 'quiz_5'],
  document: ['doc_1', 'doc_5'],
  image: ['image_1'],
  mindmap: ['mindmap_1'],
  code: ['code_1'],
  streak: ['streak_3', 'streak_7', 'streak_30'],
  level: ['level_5', 'level_10'],
};

// Map action to the UserStats field to increment
export const ACTION_STAT_MAP: Record<string, string> = {
  chat: 'totalChats',
  quiz: 'totalQuizzes',
  document: 'totalDocuments',
  image: 'totalImages',
  mindmap: 'totalMindmaps',
  code: 'totalCodeExecs',
};

// Daily challenge templates
export const DAILY_CHALLENGE_TEMPLATES = [
  { titleAr: 'محادثة صباحية', titleEn: 'Morning Chat', descriptionAr: 'أرسل 3 رسائل اليوم', descriptionEn: 'Send 3 messages today', type: 'chat', targetCount: 3, points: 50 },
  { titleAr: 'مستكشف المعرفة', titleEn: 'Knowledge Explorer', descriptionAr: 'أكمل اختباراً واحداً', descriptionEn: 'Complete one quiz', type: 'quiz', targetCount: 1, points: 75 },
  { titleAr: 'كاتب مبدع', titleEn: 'Creative Writer', descriptionAr: 'أنشئ مستنداً جديداً', descriptionEn: 'Create a new document', type: 'document', targetCount: 1, points: 60 },
  { titleAr: 'فنان اليوم', titleEn: 'Artist of the Day', descriptionAr: 'أنشئ صورة بالذكاء الاصطناعي', descriptionEn: 'Create an AI image', type: 'image', targetCount: 1, points: 60 },
  { titleAr: 'عقل منظم', titleEn: 'Organized Mind', descriptionAr: 'أنشئ خريطة ذهنية', descriptionEn: 'Create a mind map', type: 'mindmap', targetCount: 1, points: 60 },
  { titleAr: 'مبرمج نشيط', titleEn: 'Active Programmer', descriptionAr: 'شغّل كوداً جديداً', descriptionEn: 'Execute new code', type: 'code', targetCount: 1, points: 60 },
  { titleAr: 'محادثة مستمرة', titleEn: 'Continuous Chat', descriptionAr: 'أرسل 5 رسائل اليوم', descriptionEn: 'Send 5 messages today', type: 'chat', targetCount: 5, points: 100 },
  { titleAr: 'متعدد المهارات', titleEn: 'Multi-talented', descriptionAr: 'استخدم 3 ميزات مختلفة', descriptionEn: 'Use 3 different features', type: 'chat', targetCount: 3, points: 120 },
];
