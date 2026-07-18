/**
 * POST /api/ai/deploy
 * Secure Deployment (Project #106)
 * 
 * Generates deployment configurations for different platforms:
 * - Docker
 * - Vercel
 * - HuggingFace Spaces
 * - Railway
 * - Fly.io
 */

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      platform: 'docker' | 'vercel' | 'huggingface' | 'railway' | 'fly';
      appName?: string;
      port?: number;
      envVars?: Record<string, string>;
    };

    if (!body.platform) {
      return NextResponse.json({ error: 'platform required' }, { status: 400 });
    }

    const configs = generateDeployConfigs(body);

    return NextResponse.json({
      success: true,
      platform: body.platform,
      configs,
      instructions: getInstructions(body.platform),
    });
  } catch (error) {
    return NextResponse.json({ error: 'Deploy config failed' }, { status: 500 });
  }
}

function generateDeployConfigs(body: any): Record<string, string> {
  const appName = body.appName || 'anzaro-ai';
  const port = body.port || 3000;
  const envVars = body.envVars || {};

  const envFile = Object.entries(envVars)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  return {
    'Dockerfile': `FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --include=dev
COPY . .
RUN npm run build
EXPOSE ${port}
CMD ["npm", "start"]`,
    
    'docker-compose.yml': `version: '3.8'
services:
  ${appName}:
    build: .
    ports:
      - "${port}:${port}"
    env_file: .env
    restart: unless-stopped`,
    
    'vercel.json': `{
  "version": 2,
  "name": "${appName}",
  "builds": [{ "src": "next.config.ts", "use": "@vercel/next" }],
  "env": ${JSON.stringify(envVars, null, 2)}
}`,
    
    '.env.example': envFile || '# Add your environment variables here',
  };
}

function getInstructions(platform: string): string {
  const instructions: Record<string, string> = {
    docker: '1. docker build -t anzaro-ai .\n2. docker run -p 3000:3000 --env-file .env anzaro-ai',
    vercel: '1. npm i -g vercel\n2. vercel --prod',
    huggingface: '1. Push to HuggingFace Spaces repo\n2. Set secrets in Space settings\n3. Auto-deploys on push',
    railway: '1. railway init\n2. railway up\n3. Set env vars in Railway dashboard',
    fly: '1. fly launch\n2. fly deploy',
  };
  return instructions[platform] || 'See platform docs';
}

export async function GET() {
  return NextResponse.json({
    name: 'Secure Deployment Generator',
    platforms: ['docker', 'vercel', 'huggingface', 'railway', 'fly'],
  });
}
