import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { extractBearerToken, getUserFromToken } from '@/lib/auth';
import { ACHIEVEMENTS, ACTION_ACHIEVEMENT_MAP, ACTION_STAT_MAP } from '@/lib/achievements';

// ─── Helper: Seed achievements into DB if they don't exist yet ────────
async function seedAchievementsIfNeeded() {
  const existingCount = await db.achievement.count();
  if (existingCount === 0) {
    // No achievements in DB yet — seed them all
    for (const def of ACHIEVEMENTS) {
      await db.achievement.upsert({
        where: { key: def.key },
        update: {},
        create: {
          key: def.key,
          titleAr: def.titleAr,
          titleEn: def.titleEn,
          descriptionAr: def.descriptionAr,
          descriptionEn: def.descriptionEn,
          icon: def.icon,
          category: def.category,
          points: def.points,
          requirement: def.requirement,
        },
      });
    }
  }
}

// GET /api/user/stats — Returns user stats + level + achievements + today's challenge
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

    // Seed achievements if they don't exist yet
    await seedAchievementsIfNeeded();

    // Get or create user stats (upsert prevents race condition)
    let stats = await db.userStats.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
    });

    // Get user's unlocked achievements
    const unlockedAchievements = await db.userAchievement.findMany({
      where: { userId: user.id },
      include: { achievement: true },
    });

    // Get today's challenge
    const today = new Date().toISOString().split('T')[0];
    let dailyChallenge = await db.dailyChallenge.findUnique({
      where: { day: today },
    });

    let challengeCompleted = false;
    if (dailyChallenge) {
      const completion = await db.challengeCompletion.findUnique({
        where: {
          userId_challengeId: {
            userId: user.id,
            challengeId: dailyChallenge.id,
          },
        },
      });
      challengeCompleted = !!completion;
    }

    // Calculate level from points (level = floor(totalPoints / 100) + 1)
    const level = Math.floor(stats.totalPoints / 100) + 1;
    const pointsInCurrentLevel = stats.totalPoints % 100;
    const pointsForNextLevel = 100;

    return NextResponse.json({
      stats: {
        totalPoints: stats.totalPoints,
        level,
        pointsInCurrentLevel,
        pointsForNextLevel,
        totalChats: stats.totalChats,
        totalQuizzes: stats.totalQuizzes,
        totalDocuments: stats.totalDocuments,
        totalImages: stats.totalImages,
        totalMindmaps: stats.totalMindmaps,
        totalCodeExecs: stats.totalCodeExecs,
        currentStreak: stats.currentStreak,
        longestStreak: stats.longestStreak,
        lastActiveDate: stats.lastActiveDate,
      },
      unlockedAchievements: unlockedAchievements.map((ua) => ({
        key: ua.achievement.key,
        unlockedAt: ua.unlockedAt,
      })),
      totalAchievements: ACHIEVEMENTS.length,
      dailyChallenge: dailyChallenge
        ? {
            id: dailyChallenge.id,
            titleAr: dailyChallenge.titleAr,
            titleEn: dailyChallenge.titleEn,
            descriptionAr: dailyChallenge.descriptionAr,
            descriptionEn: dailyChallenge.descriptionEn,
            type: dailyChallenge.type,
            targetCount: dailyChallenge.targetCount,
            points: dailyChallenge.points,
            completed: challengeCompleted,
          }
        : null,
    });
  } catch (error) {
    console.error('User stats GET error:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

// POST /api/user/stats — Increment a stat and check achievements
export async function POST(request: Request) {
  try {
    const token = extractBearerToken(request.headers.get('Authorization'));
    if (!token) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    }

    const user = await getUserFromToken(token);
    if (!user) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    }

    // Seed achievements if they don't exist yet
    await seedAchievementsIfNeeded();

    const body = await request.json();
    const { action } = body as { action?: string };

    if (!action || !ACTION_STAT_MAP[action]) {
      return NextResponse.json({ error: 'إجراء غير صالح' }, { status: 400 });
    }

    const statField = ACTION_STAT_MAP[action];

    // Get or create user stats (upsert prevents race condition)
    let stats = await db.userStats.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
    });

    // Update streak
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    let newStreak = stats.currentStreak;

    if (stats.lastActiveDate === today) {
      // Already active today, no streak change
    } else if (stats.lastActiveDate === yesterday) {
      // Consecutive day
      newStreak = stats.currentStreak + 1;
    } else {
      // Streak broken
      newStreak = 1;
    }

    const longestStreak = Math.max(stats.longestStreak, newStreak);

    // Increment the stat and update streak
    stats = await db.userStats.update({
      where: { userId: user.id },
      data: {
        [statField]: { increment: 1 },
        currentStreak: newStreak,
        longestStreak,
        lastActiveDate: today,
      },
    });

    // Also update the User model's streak field
    await db.user.update({
      where: { id: user.id },
      data: { streak: newStreak },
    });

    // Calculate new level
    const newLevel = Math.floor(stats.totalPoints / 100) + 1;

    // Check and unlock achievements
    const newlyUnlocked: string[] = [];
    const achievementKeys = ACTION_ACHIEVEMENT_MAP[action] || [];

    // Also check streak and level achievements
    const allKeysToCheck = [...achievementKeys];
    if (newStreak >= 3) allKeysToCheck.push(...ACTION_ACHIEVEMENT_MAP.streak);
    if (newLevel >= 5) allKeysToCheck.push(...ACTION_ACHIEVEMENT_MAP.level);

    for (const key of allKeysToCheck) {
      const achievementDef = ACHIEVEMENTS.find((a) => a.key === key);
      if (!achievementDef) continue;

      // Check if already unlocked
      const existing = await db.userAchievement.findFirst({
        where: { userId: user.id, achievement: { key } },
      });
      if (existing) continue;

      // Find or create achievement (upsert prevents race condition)
      let achievement = await db.achievement.upsert({
        where: { key },
        create: {
          key: achievementDef.key,
          titleAr: achievementDef.titleAr,
          titleEn: achievementDef.titleEn,
          descriptionAr: achievementDef.descriptionAr,
          descriptionEn: achievementDef.descriptionEn,
          icon: achievementDef.icon,
          category: achievementDef.category,
          points: achievementDef.points,
          requirement: achievementDef.requirement,
        },
        update: {},
      });

      // Check if requirement met based on stat type
      let statValue = 0;
      if (key.startsWith('chat_') || key === 'first_chat') statValue = stats.totalChats;
      else if (key.startsWith('quiz_')) statValue = stats.totalQuizzes;
      else if (key.startsWith('doc_')) statValue = stats.totalDocuments;
      else if (key.startsWith('image_')) statValue = stats.totalImages;
      else if (key.startsWith('mindmap_')) statValue = stats.totalMindmaps;
      else if (key.startsWith('code_')) statValue = stats.totalCodeExecs;
      else if (key.startsWith('streak_')) statValue = stats.currentStreak;
      else if (key.startsWith('level_')) statValue = newLevel;

      if (statValue >= achievementDef.requirement) {
        // Unlock the achievement and add points
        await db.userAchievement.create({
          data: {
            userId: user.id,
            achievementId: achievement.id,
          },
        });

        // Add achievement points to total
        stats = await db.userStats.update({
          where: { userId: user.id },
          data: {
            totalPoints: { increment: achievementDef.points },
          },
        });

        newlyUnlocked.push(key);
      }
    }

    // Recalculate level after potential points addition
    const finalLevel = Math.floor(stats.totalPoints / 100) + 1;

    // Check level achievements again if level changed
    if (finalLevel > newLevel) {
      for (const key of ACTION_ACHIEVEMENT_MAP.level) {
        const achievementDef = ACHIEVEMENTS.find((a) => a.key === key);
        if (!achievementDef || finalLevel < achievementDef.requirement) continue;

        const existing = await db.userAchievement.findFirst({
          where: { userId: user.id, achievement: { key } },
        });
        if (existing) continue;

        let achievement = await db.achievement.upsert({
          where: { key },
          create: {
            key: achievementDef.key,
            titleAr: achievementDef.titleAr,
            titleEn: achievementDef.titleEn,
            descriptionAr: achievementDef.descriptionAr,
            descriptionEn: achievementDef.descriptionEn,
            icon: achievementDef.icon,
            category: achievementDef.category,
            points: achievementDef.points,
            requirement: achievementDef.requirement,
          },
          update: {},
        });

        // Use createMany with skipDuplicates to prevent P2002 on concurrent achievement unlocks
        await db.userAchievement.create({
          data: { userId: user.id, achievementId: achievement.id },
        }).catch(() => {
          // Already unlocked — ignore duplicate key error
        });

        stats = await db.userStats.update({
          where: { userId: user.id },
          data: { totalPoints: { increment: achievementDef.points } },
        });

        newlyUnlocked.push(key);
      }
    }

    return NextResponse.json({
      success: true,
      stats: {
        totalPoints: stats.totalPoints,
        level: Math.floor(stats.totalPoints / 100) + 1,
        currentStreak: stats.currentStreak,
        longestStreak: stats.longestStreak,
        [statField]: (stats as Record<string, unknown>)[statField],
      },
      newlyUnlocked,
    });
  } catch (error) {
    console.error('User stats POST error:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
