/**
 * GET /api/youtube/search?q=query
 * بحث في YouTube عن فيديوهات (باستخدام YouTube Data API)
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || '';

export const GET = withAuth(async (request: NextRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || searchParams.get('query');

    if (!query) {
      return NextResponse.json({ error: 'query مطلوبة' }, { status: 400 });
    }

    if (!YOUTUBE_API_KEY) {
      return NextResponse.json({ error: 'YOUTUBE_API_KEY not configured' }, { status: 500 });
    }

    // Search YouTube
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=10&q=${encodeURIComponent(query + ' audio')}&key=${YOUTUBE_API_KEY}`;
    const response = await fetch(searchUrl);

    if (!response.ok) {
      const errText = await response.text();
      console.error('[YouTube] Search failed:', errText);
      return NextResponse.json({ error: 'search_failed', message: errText.slice(0, 200) }, { status: 500 });
    }

    const data = await response.json();
    const videos = (data.items || []).map((item: any) => ({
      videoId: item.id?.videoId,
      title: item.snippet?.title,
      channel: item.snippet?.channelTitle,
      thumbnail: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url,
      publishedAt: item.snippet?.publishedAt,
    })).filter((v: any) => v.videoId);

    return NextResponse.json({ success: true, videos });
  } catch (error: any) {
    console.error('[YouTube] Search error:', error);
    return NextResponse.json({ error: 'server_error', message: error.message }, { status: 500 });
  }
});
