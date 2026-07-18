import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { extractBearerToken, getUserFromToken } from '@/lib/auth';
import { ACHIEVEMENTS } from '@/lib/achievements';

// GET /api/user/achievements — List all achievements + which ones the user has unlocked
export async function GET(request: Request) {
  try {
    const token = extractBearerToken(request.headers.get('Authorization'));
    if (!token) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    }

    const user = await getUserFromToken(token);
    if (!user) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    }

    // Get user's unlocked achievements
    const userAchievements = await db.userAchievement.findMany({
      where: { userId: user.id },
      include: { achievement: true },
    });

    // Create a map of unlocked achievement keys
    const unlockedMap = new Map<string, Date>();
    for (const ua of userAchievements) {
      unlockedMap.set(ua.achievement.key, ua.unlockedAt);
    }

    // Build full list
    const achievements = ACHIEVEMENTS.map((def) => {
      const unlockedAt = unlockedMap.get(def.key);
      return {
        key: def.key,
        titleAr: def.titleAr,
        titleEn: def.titleEn,
        descriptionAr: def.descriptionAr,
        descriptionEn: def.descriptionEn,
        icon: def.icon,
        category: def.category,
        points: def.points,
        requirement: def.requirement,
        unlocked: !!unlockedAt,
        unlockedAt: unlockedAt || null,
      };
    });

    const totalUnlocked = achievements.filter((a) => a.unlocked).length;
    const totalPoints = achievements
      .filter((a) => a.unlocked)
      .reduce((sum, a) => sum + a.points, 0);

    // Group by category
    const categories = {
      chat: achievements.filter((a) => a.category === 'chat'),
      learning: achievements.filter((a) => a.category === 'learning'),
      creative: achievements.filter((a) => a.category === 'creative'),
      general: achievements.filter((a) => a.category === 'general'),
    };

    return NextResponse.json({
      achievements,
      categories,
      totalUnlocked,
      totalAchievements: ACHIEVEMENTS.length,
      totalPoints,
    });
  } catch (error) {
    console.error('User achievements GET error:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
