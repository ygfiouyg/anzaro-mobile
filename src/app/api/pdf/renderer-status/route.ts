import { NextResponse } from 'next/server';
import { checkRendererAvailability } from '@/lib/rendering-pipeline';

export async function GET() {
  try {
    const availability = await checkRendererAvailability();

    return NextResponse.json({
      success: true,
      renderers: {
        playwright: {
          available: availability.playwright,
          label: 'Playwright (Chromium)',
          description: 'Primary and only renderer — HTML/CSS → PDF via Chromium',
        },
      },
      primary: 'playwright',
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Failed to check renderer availability',
      renderers: {
        playwright: { available: false },
      },
      primary: 'playwright',
    });
  }
}
