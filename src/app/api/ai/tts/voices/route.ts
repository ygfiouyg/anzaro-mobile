import { NextRequest, NextResponse } from 'next/server';
import { VOICES } from '@/lib/hf-tts.service';

export async function GET(request: NextRequest) {
  const voices = VOICES.map(v => ({
    id: v.id,
    name: v.name,
    nameAr: v.nameAr,
    dialect: v.dialect,
    dialectAr: v.dialectAr,
    provider: v.provider,
    gender: v.gender,
    preview: v.preview,
    badgeColor: v.badgeColor,
  }));

  return NextResponse.json({ voices });
}
