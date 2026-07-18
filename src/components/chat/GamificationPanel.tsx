'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Flame, Star, Lock, CheckCircle2, Loader2, ChevronLeft, Target, Zap, Share2, PartyPopper, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth-store';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';

interface GamificationPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Types for API data
interface UserStats {
  totalPoints: number;
  level: number;
  pointsInCurrentLevel: number;
  pointsForNextLevel: number;
  totalChats: number;
  totalQuizzes: number;
  totalDocuments: number;
  totalImages: number;
  totalMindmaps: number;
  totalCodeExecs: number;
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string | null;
}

interface AchievementItem {
  key: string;
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  icon: string;
  category: string;
  points: number;
  requirement: number;
  unlocked: boolean;
  unlockedAt: string | null;
}

interface DailyChallengeItem {
  id: string;
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  type: string;
  targetCount: number;
  points: number;
  day: string;
  completed?: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  chat: '💬 المحادثة',
  learning: '📚 التعلم',
  creative: '🎨 الإبداع',
  general: '⭐ عام',
};

const CATEGORY_COLORS: Record<string, string> = {
  chat: 'from-blue-500 to-blue-600',
  learning: 'from-blue-500 to-blue-600',
  creative: 'from-blue-500 to-blue-600',
  general: 'from-blue-500 to-blue-600',
};

const TYPE_ICONS: Record<string, string> = {
  chat: '💬',
  quiz: '📝',
  document: '📄',
  image: '🎨',
  mindmap: '🧠',
  code: '💻',
};

// ─── Confetti Animation Component ────────────────────────────────────
function ConfettiCelebration({ show, onDone }: { show: boolean; onDone: () => void }) {
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number; color: string; delay: number; size: number; rotation: number }>>([]);

  useEffect(() => {
    if (show) {
      const colors = ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8'];
      const newParticles = Array.from({ length: 30 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: -10 - Math.random() * 20,
        color: colors[Math.floor(Math.random() * colors.length)],
        delay: Math.random() * 0.5,
        size: 6 + Math.random() * 8,
        rotation: Math.random() * 360,
      }));
      setParticles(newParticles);

      const timer = setTimeout(() => {
        setParticles([]);
        onDone();
      }, 2500);

      return () => clearTimeout(timer);
    }
  }, [show, onDone]);

  if (!show || particles.length === 0) return null;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-50">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          initial={{ x: `${p.x}%`, y: `${p.y}%`, rotate: p.rotation, opacity: 1, scale: 1 }}
          animate={{
            y: '110%',
            x: `${p.x + (Math.random() - 0.5) * 30}%`,
            rotate: p.rotation + 720,
            opacity: [1, 1, 0],
            scale: [1, 1.2, 0.5],
          }}
          transition={{
            duration: 2 + Math.random(),
            delay: p.delay,
            ease: 'easeOut',
          }}
          className="absolute rounded-sm"
          style={{
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
          }}
        />
      ))}
    </div>
  );
}

export function GamificationPanel({ open, onOpenChange }: GamificationPanelProps) {
  const [stats, setStats] = useState<UserStats | null>(null);
  const [achievements, setAchievements] = useState<AchievementItem[]>([]);
  const [dailyChallenge, setDailyChallenge] = useState<DailyChallengeItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [challengeCompleting, setChallengeCompleting] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationAchievement, setCelebrationAchievement] = useState<AchievementItem | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const { token } = useAuthStore();
  const prevUnlockedKeysRef = useRef<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    if (!token) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };

      const [statsRes, achievementsRes, challengeRes] = await Promise.all([
        fetch('/api/user/stats', { headers }),
        fetch('/api/user/achievements', { headers }),
        fetch('/api/user/daily-challenge', { headers }),
      ]);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData.stats);
        setDailyChallenge(statsData.dailyChallenge
          ? { ...statsData.dailyChallenge }
          : null
        );
      }

      if (achievementsRes.ok) {
        const achievementsData = await achievementsRes.json();
        const newAchievements: AchievementItem[] = achievementsData.achievements;

        // Detect newly unlocked achievements for celebration
        const currentUnlockedKeys = new Set(
          newAchievements.filter((a: AchievementItem) => a.unlocked && a.unlockedAt).map((a: AchievementItem) => a.key)
        );

        // Check if there are newly unlocked achievements (unlocked in the last 30 seconds)
        const now = Date.now();
        const recentUnlock = newAchievements.find((a: AchievementItem) => {
          if (!a.unlocked || !a.unlockedAt) return false;
          const unlockedTime = new Date(a.unlockedAt).getTime();
          return (now - unlockedTime) < 30000 && !prevUnlockedKeysRef.current.has(a.key);
        });

        if (recentUnlock && prevUnlockedKeysRef.current.size > 0) {
          setCelebrationAchievement(recentUnlock);
          setShowCelebration(true);
        }

        prevUnlockedKeysRef.current = currentUnlockedKeys;
        setAchievements(newAchievements);
      }

      if (challengeRes.ok) {
        const challengeData = await challengeRes.json();
        if (challengeData.challenge) {
          setDailyChallenge((prev) => ({
            ...challengeData.challenge,
            completed: challengeData.completed,
          }));
        }
      }
    } catch (error) {
      console.error('[Gamification] Fetch error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (open) {
      fetchData();
    }
  }, [open, fetchData]);

  const handleCompleteChallenge = async () => {
    if (!token || challengeCompleting) return;
    setChallengeCompleting(true);
    try {
      const res = await fetch('/api/user/daily-challenge', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setDailyChallenge((prev) => prev ? { ...prev, completed: true } : null);
          // Refresh stats
          await fetchData();
        }
      }
    } catch (error) {
      console.error('[Gamification] Complete challenge error:', error);
    } finally {
      setChallengeCompleting(false);
    }
  };

  const handleShareAchievement = async (achievement: AchievementItem) => {
    const text = `🏆 إنجاز جديد في Anzaro AI!\n\n${achievement.icon} ${achievement.titleAr}\n${achievement.descriptionAr}\n⭐ +${achievement.points} نقطة`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(achievement.key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      // Fallback — ignore
    }
  };

  const unlockedCount = achievements.filter((a) => a.unlocked).length;
  const totalPoints = achievements.filter((a) => a.unlocked).reduce((sum, a) => sum + a.points, 0);

  // Determine if this is a fresh user with no activity
  const isFreshUser = stats && stats.totalChats === 0 && stats.totalQuizzes === 0 &&
    stats.totalDocuments === 0 && stats.totalImages === 0 && stats.totalMindmaps === 0 &&
    stats.totalCodeExecs === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] p-0 gap-0 overflow-hidden" dir="rtl">
        {/* Celebration overlay */}
        <ConfettiCelebration
          show={showCelebration}
          onDone={() => setShowCelebration(false)}
        />

        {/* Achievement unlock popup */}
        <AnimatePresence>
          {showCelebration && celebrationAchievement && (
            <motion.div
              initial={{ opacity: 0, scale: 0.5, y: -50 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.5, y: -50 }}
              className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-gradient-to-l from-blue-400 to-blue-500 text-white px-6 py-3 rounded-2xl shadow-lg shadow-blue-500 flex items-center gap-3"
            >
              <PartyPopper className="size-6" />
              <div>
                <p className="text-sm font-bold">إنجاز جديد!</p>
                <p className="text-xs">{celebrationAchievement.icon} {celebrationAchievement.titleAr}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Header */}
        <div className="bg-gradient-to-l from-blue-500 to-blue-500 p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2 text-lg">
              <Trophy className="size-5" />
              الإنجازات والمستوى
            </DialogTitle>
            <DialogDescription className="text-blue-100 text-sm">
              تتبع تقدمك وحقق الإنجازات
            </DialogDescription>
          </DialogHeader>

          {/* Level + Streak Bar */}
          {stats && (
            <div className="mt-4 flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="size-12 rounded-xl bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                  <Star className="size-6 text-white" />
                </div>
                <div>
                  <p className="text-white text-xl font-bold">المستوى {stats.level}</p>
                  <p className="text-blue-100 text-xs">{stats.totalPoints} نقطة</p>
                </div>
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-blue-100 text-xs">{stats.pointsInCurrentLevel}/{stats.pointsForNextLevel}</span>
                  <span className="text-blue-100 text-xs">XP</span>
                </div>
                <Progress
                  value={(stats.pointsInCurrentLevel / stats.pointsForNextLevel) * 100}
                  className="h-2.5 bg-blue-100 dark:bg-blue-900"
                />
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-100 dark:bg-blue-900 ">
                <Flame className="size-5 text-blue-200" />
                <div className="text-center">
                  <p className="text-white text-lg font-bold leading-tight">{stats.currentStreak}</p>
                  <p className="text-blue-100 text-[10px]">يوم متتالي</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <div className="px-4 pt-3">
            <TabsList className="w-full">
              <TabsTrigger value="overview" className="flex-1 text-xs">نظرة عامة</TabsTrigger>
              <TabsTrigger value="achievements" className="flex-1 text-xs">الإنجازات</TabsTrigger>
              <TabsTrigger value="stats" className="flex-1 text-xs">الإحصائيات</TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className="flex-1 max-h-[50vh]">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Loader2 className="size-8 animate-spin text-blue-500" />
                <p className="text-sm text-muted-foreground">جاري تحميل البيانات...</p>
              </div>
            ) : (
              <>
                {/* Overview Tab */}
                <TabsContent value="overview" className="px-4 pb-4 pt-2">
                  {/* Fresh User Encouragement */}
                  {isFreshUser && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mb-4 p-4 rounded-xl bg-gradient-to-l from-blue-50 to-blue-50 dark:from-blue-950 dark:to-blue-950 border border-blue-200 dark:border-blue-800 text-center"
                    >
                      <span className="text-3xl block mb-2">🚀</span>
                      <p className="text-sm font-bold text-blue-700 dark:text-blue-300 mb-1">
                        ابدأ رحلتك مع Anzaro AI!
                      </p>
                      <p className="text-xs text-blue-600 dark:text-blue-400 leading-relaxed">
                        أرسل رسالة، أكمل اختباراً، أو أنشئ صورة لتحقيق أول إنجاز والبدء في جمع النقاط
                      </p>
                    </motion.div>
                  )}

                  {/* Today's Challenge */}
                  <div className="mb-4">
                    <h3 className="text-sm font-bold text-foreground mb-2 flex items-center gap-1.5">
                      <Target className="size-4 text-blue-500" />
                      تحدي اليوم
                    </h3>
                    {dailyChallenge ? (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={cn(
                          'p-4 rounded-xl border-2 transition-all',
                          dailyChallenge.completed
                            ? 'bg-blue-50 dark:bg-blue-950 border-blue-300 dark:border-blue-700'
                            : 'bg-blue-50 dark:bg-blue-950 border-blue-300 dark:border-blue-700'
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div className="size-10 rounded-lg bg-gradient-to-bl from-blue-400 to-blue-500 flex items-center justify-center text-xl flex-shrink-0">
                            {TYPE_ICONS[dailyChallenge.type] || '🎯'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-foreground text-sm">{dailyChallenge.titleAr}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{dailyChallenge.descriptionAr}</p>
                            <div className="flex items-center gap-2 mt-2">
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                <Zap className="size-3 ml-1" />
                                {dailyChallenge.points} نقطة
                              </Badge>
                              {dailyChallenge.completed ? (
                                <Badge className="text-[10px] px-1.5 py-0 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700">
                                  <CheckCircle2 className="size-3 ml-1" />
                                  مكتمل
                                </Badge>
                              ) : (
                                <button
                                  onClick={handleCompleteChallenge}
                                  disabled={challengeCompleting}
                                  className={cn(
                                    'text-[10px] px-2.5 py-1 rounded-lg font-semibold transition-all',
                                    'bg-blue-500 hover:bg-blue-600 text-white',
                                    challengeCompleting && 'opacity-50 cursor-not-allowed'
                                  )}
                                >
                                  {challengeCompleting ? (
                                    <span className="flex items-center gap-1">
                                      <Loader2 className="size-3 animate-spin" />
                                      جاري الإكمال...
                                    </span>
                                  ) : (
                                    'إكمال التحدي'
                                  )}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ) : (
                      <div className="p-4 rounded-xl muted border border-border text-center">
                        <p className="text-sm text-muted-foreground">لا يوجد تحدي لليوم</p>
                      </div>
                    )}
                  </div>

                  {/* Quick Stats Grid */}
                  {stats && (
                    <div className="mb-4">
                      <h3 className="text-sm font-bold text-foreground mb-2 flex items-center gap-1.5">
                        <Zap className="size-4 text-blue-500" />
                        ملخص سريع
                      </h3>
                      <div className="grid grid-cols-3 gap-2">
                        <StatCard icon="💬" label="محادثات" value={stats.totalChats} color="sky" />
                        <StatCard icon="📝" label="اختبارات" value={stats.totalQuizzes} color="purple" />
                        <StatCard icon="📄" label="مستندات" value={stats.totalDocuments} color="emerald" />
                        <StatCard icon="🎨" label="صور" value={stats.totalImages} color="pink" />
                        <StatCard icon="🧠" label="خرائط ذهنية" value={stats.totalMindmaps} color="orange" />
                        <StatCard icon="💻" label="أكواد" value={stats.totalCodeExecs} color="violet" />
                      </div>
                    </div>
                  )}

                  {/* Recent Achievements Preview */}
                  <div>
                    <h3 className="text-sm font-bold text-foreground mb-2 flex items-center gap-1.5">
                      <Trophy className="size-4 text-blue-500" />
                      آخر الإنجازات
                    </h3>
                    <div className="space-y-2">
                      {achievements
                        .filter((a) => a.unlocked)
                        .sort((a, b) => new Date(b.unlockedAt!).getTime() - new Date(a.unlockedAt!).getTime())
                        .slice(0, 3)
                        .map((achievement) => (
                          <div
                            key={achievement.key}
                            className="flex items-center gap-3 p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800"
                          >
                            <span className="text-xl">{achievement.icon}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-foreground">{achievement.titleAr}</p>
                              <p className="text-[10px] text-muted-foreground">{achievement.descriptionAr}</p>
                            </div>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-700">
                              +{achievement.points}
                            </Badge>
                          </div>
                        ))
                      }
                      {achievements.filter((a) => a.unlocked).length === 0 && (
                        <div className="p-4 rounded-xl muted border border-border text-center">
                          <span className="text-2xl block mb-1">🏆</span>
                          <p className="text-xs text-muted-foreground font-semibold">لم تُحقق أي إنجازات بعد</p>
                          <p className="text-[10px] text-muted-foreground mt-1">ابدأ باستخدام المنصة لفتح إنجازاتك الأولى!</p>
                        </div>
                      )}
                    </div>
                  </div>
                </TabsContent>

                {/* Achievements Tab */}
                <TabsContent value="achievements" className="px-4 pb-4 pt-2">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs text-muted-foreground">
                      {unlockedCount} من {achievements.length} إنجاز
                    </p>
                    <Badge variant="outline" className="text-[10px]">
                      <Star className="size-3 ml-1 text-blue-500" />
                      {totalPoints} نقطة
                    </Badge>
                  </div>

                  {/* Category groups */}
                  {Object.entries(CATEGORY_LABELS).map(([catKey, catLabel]) => {
                    const catAchievements = achievements.filter((a) => a.category === catKey);
                    if (catAchievements.length === 0) return null;

                    return (
                      <div key={catKey} className="mb-4">
                        <h4 className="text-xs font-bold text-muted-foreground mb-2">{catLabel}</h4>
                        <div className="grid grid-cols-2 gap-2">
                          {catAchievements.map((achievement) => (
                            <AchievementCard
                              key={achievement.key}
                              achievement={achievement}
                              categoryColor={CATEGORY_COLORS[catKey] || CATEGORY_COLORS.general}
                              onShare={handleShareAchievement}
                              copiedKey={copiedKey}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </TabsContent>

                {/* Stats Tab */}
                <TabsContent value="stats" className="px-4 pb-4 pt-2">
                  {stats ? (
                    <div className="space-y-3">
                      {/* Points & Level */}
                      <div className="p-4 rounded-xl bg-gradient-to-l from-blue-50 to-blue-50 dark:from-blue-950 dark:to-blue-950 border border-blue-200 dark:border-blue-800">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Star className="size-5 text-blue-500" />
                            <span className="font-bold text-foreground">النقاط والمستوى</span>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950 dark:bg-blue-200 dark:bg-blue-800">
                            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.totalPoints}</p>
                            <p className="text-[10px] text-muted-foreground">إجمالي النقاط</p>
                          </div>
                          <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950 dark:bg-blue-200 dark:bg-blue-800">
                            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.level}</p>
                            <p className="text-[10px] text-muted-foreground">المستوى الحالي</p>
                          </div>
                        </div>
                      </div>

                      {/* Activity Stats */}
                      <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
                        <div className="flex items-center gap-2 mb-3">
                          <Zap className="size-5 text-blue-500" />
                          <span className="font-bold text-foreground">إحصائيات النشاط</span>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <StatCard icon="💬" label="محادثات" value={stats.totalChats} color="sky" />
                          <StatCard icon="📝" label="اختبارات" value={stats.totalQuizzes} color="purple" />
                          <StatCard icon="📄" label="مستندات" value={stats.totalDocuments} color="emerald" />
                          <StatCard icon="🎨" label="صور" value={stats.totalImages} color="pink" />
                          <StatCard icon="🧠" label="خرائط ذهنية" value={stats.totalMindmaps} color="orange" />
                          <StatCard icon="💻" label="أكواد" value={stats.totalCodeExecs} color="violet" />
                        </div>
                      </div>

                      {/* Streak */}
                      <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
                        <div className="flex items-center gap-2 mb-3">
                          <Flame className="size-5 text-blue-500" />
                          <span className="font-bold text-foreground">سلسلة الاستمرارية</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950 dark:bg-blue-200 dark:bg-blue-800">
                            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.currentStreak}</p>
                            <p className="text-[10px] text-muted-foreground">السلسلة الحالية</p>
                          </div>
                          <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950 dark:bg-blue-200 dark:bg-blue-800">
                            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.longestStreak}</p>
                            <p className="text-[10px] text-muted-foreground">أطول سلسلة</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-6 rounded-xl muted border border-border text-center">
                      <span className="text-3xl block mb-2">📊</span>
                      <p className="text-sm font-semibold text-foreground mb-1">لا توجد إحصائيات بعد</p>
                      <p className="text-xs text-muted-foreground">ابدأ باستخدام المنصة لعرض إحصائياتك هنا</p>
                    </div>
                  )}
                </TabsContent>
              </>
            )}
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ─── Sub-components ────────────────────────────────────────────────

function StatCard({ icon, label, value, color }: { icon: string; label: string; value: number; color: string }) {
  const colorClasses: Record<string, string> = {
    sky: 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400',
    purple: 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400',
    emerald: 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400',
    pink: 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400',
    orange: 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400',
    violet: 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400',
  };

  return (
    <div className={cn('p-2.5 rounded-lg text-center', colorClasses[color] || colorClasses.emerald)}>
      <p className="text-lg mb-0.5">{icon}</p>
      <p className="text-lg font-bold leading-tight">{value}</p>
      <p className="text-[9px] opacity-70">{label}</p>
    </div>
  );
}

function AchievementCard({
  achievement,
  categoryColor,
  onShare,
  copiedKey,
}: {
  achievement: AchievementItem;
  categoryColor: string;
  onShare: (a: AchievementItem) => void;
  copiedKey: string | null;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        'relative p-3 rounded-xl border transition-all',
        achievement.unlocked
          ? 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800 shadow-sm'
          : 'bg-muted border-border opacity-60'
      )}
    >
      {!achievement.unlocked && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl background-[1px]">
          <Lock className="size-5 text-muted-foreground" />
        </div>
      )}

      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-xl">{achievement.icon}</span>
        <div className="flex-1 min-w-0">
          <p className={cn(
            'text-xs font-bold truncate',
            achievement.unlocked ? 'text-foreground' : 'text-muted-foreground'
          )}>
            {achievement.titleAr}
          </p>
        </div>
      </div>

      <p className={cn(
        'text-[10px] leading-relaxed mb-1.5',
        achievement.unlocked ? 'text-muted-foreground' : 'text-muted-foreground'
      )}>
        {achievement.descriptionAr}
      </p>

      <div className="flex items-center justify-between">
        <span className={cn(
          'text-[9px] px-1.5 py-0.5 rounded-full font-medium',
          achievement.unlocked
            ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
            : 'bg-muted text-muted-foreground'
        )}>
          +{achievement.points} نقطة
        </span>
        {achievement.unlocked && achievement.unlockedAt && (
          <span className="text-[9px] text-muted-foreground">
            {new Date(achievement.unlockedAt).toLocaleDateString('ar-EG')}
          </span>
        )}
      </div>

      {/* Share button for unlocked achievements */}
      {achievement.unlocked && (
        <div className="mt-2 pt-1.5 border-t border-blue-200 dark:border-blue-800">
          <button
            onClick={() => onShare(achievement)}
            className="flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
          >
            {copiedKey === achievement.key ? (
              <>
                <Check className="size-3" />
                تم النسخ
              </>
            ) : (
              <>
                <Share2 className="size-3" />
                مشاركة الإنجاز
              </>
            )}
          </button>
        </div>
      )}

      {/* Progress for locked achievements */}
      {!achievement.unlocked && (
        <div className="mt-1.5">
          <Progress value={0} className="h-1" />
        </div>
      )}
    </motion.div>
  );
}
