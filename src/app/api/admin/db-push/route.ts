/**
 * POST /api/admin/db-push
 * يشغل prisma db push يدوياً (للأدمن بس)
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export const POST = withAuth(async (request: NextRequest, ctx) => {
  try {
    const { stdout, stderr } = await execAsync('npx prisma db push --accept-data-loss 2>&1', {
      timeout: 100000,
      cwd: process.cwd(),
    });
    
    return NextResponse.json({ 
      success: true, 
      stdout: stdout.slice(-500),
      stderr: stderr.slice(-500),
    });
  } catch (error: any) {
    return NextResponse.json({ 
      error: error.message,
      stdout: error.stdout?.slice(-500),
      stderr: error.stderr?.slice(-500),
    }, { status: 500 });
  }
});
