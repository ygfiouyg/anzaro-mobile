import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    name: 'Anzaro AI',
    version: '0.2.0',
    status: 'running',
  });
}
