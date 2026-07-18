import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const fs = await import('fs');
  const path = await import('path');
  
  let configFile = 'not found';
  try {
    configFile = fs.readFileSync(path.join(process.cwd(), '.z-ai-config'), 'utf-8');
  } catch {}
  
  let envKey = process.env.ZAI_API_KEY || 'not set';
  // Mask the key
  if (envKey !== 'not set' && envKey.length > 10) {
    envKey = envKey.slice(0, 5) + '...' + envKey.slice(-5);
  }
  
  return NextResponse.json({
    configFile,
    envVarZAI_API_KEY: envKey,
    usingFreeAPI: configFile.includes('internal-api.z.ai'),
    usingPaidAPI: configFile.includes('bigmodel'),
  });
}
