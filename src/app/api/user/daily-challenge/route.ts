import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { extractBearerToken, getUserFromToken } from '@/lib/auth';
import { DAILY_CHALLENGE_TEMPLATES } from '@/lib/achievements';

// Helper: Generate a daily challenge for a given day string
async function getOrCreateDailyChallenge(day: string) {
  let challenge = await db.dailyChallenge.findUnique({
    where: { day },
  });

  if (!challenge) {
    // Pick a pseudo-random template based on the date
    const dateHash = day.split('-').reduce((acc, part) => acc + parseInt(part), 0);
    const template = DAILY_CHALLENGE_TEMPLATES[dateHash % DAILY_CHALLENGE_TEMPLATES.length];

    challenge = await db.dailyChallenge.create({
      data: {
        titleAr: template.titleAr,
        titleEn: template.titleEn,
        descriptionAr: template.descriptionAr,
        descriptionEn: template.descriptionEn,
        type: template.type,
        targetCount: template.targetCount,
        points: template.points,
        day,
      },
    });
  }

  return challenge;
}

// GET /api/user/daily-challenge — Get today's challenge + user's completion status
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

    const today = new Date().toISOString().split('T')[0];
    const challenge = await getOrCreateDailyChallenge(today);

    // Check if user has completed this challenge
    const completion = await db.challengeCompletion.findUnique({
      where: {
        userId_challengeId: {
          userId: user.id,
          challengeId: challenge.id,
        },
      },
    });

    return NextResponse.json({
      challenge: {
        id: challenge.id,
        titleAr: challenge.titleAr,
        titleEn: challenge.titleEn,
        descriptionAr: challenge.descriptionAr,
        descriptionEn: challenge.descriptionEn,
        type: challenge.type,
        targetCount: challenge.targetCount,
        points: challenge.points,
        day: challenge.day,
      },
      completed: !!completion,
      completedAt: completion?.completedAt || null,
    });
  } catch (error) {
    console.error('Daily challenge GET error:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

// POST /api/user/daily-challenge — Mark today's challenge as complete
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

    const today = new Date().toISOString().split('T')[0];
    const challenge = await getOrCreateDailyChallenge(today);

    // Check if already completed
    const existing = await db.challengeCompletion.findUnique({
      where: {
        userId_challengeId: {
          userId: user.id,
          challengeId: challenge.id,
        },
      },
    });

    if (existing) {
      return NextResponse.json({
        success: true,
        message: 'تم إكمال التحدي بالفعل',
        alreadyCompleted: true,
        points: challenge.points,
      });
    }

    // Mark as complete
    await db.challengeCompletion.create({
      data: {
        userId: user.id,
        challengeId: challenge.id,
      },
    });

    // Add challenge points to user stats (upsert prevents race condition)
    let stats = await db.userStats.upsert({
      where: { userId: user.id },
      create: { userId: user.id, totalPoints: challenge.points },
      update: {
        totalPoints: { increment: challenge.points },
      },
    });

    // Update streak
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    let newStreak = stats.currentStreak;

    if (stats.lastActiveDate === today) {
      // Already active today
    } else if (stats.lastActiveDate === yesterday) {
      newStreak = stats.currentStreak + 1;
    } else {
      newStreak = 1;
    }

    await db.userStats.update({
      where: { userId: user.id },
      data: {
        currentStreak: newStreak,
        longestStreak: Math.max(stats.longestStreak, newStreak),
        lastActiveDate: today,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'تم إكمال التحدي بنجاح!',
      alreadyCompleted: false,
      points: challenge.points,
      totalPoints: stats.totalPoints,
    });
  } catch (error) {
    console.error('Daily challenge POST error:', error);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
