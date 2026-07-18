/**
 * GET /api/n8n/templates
 * ======================
 * قائمة كل قوالب الـ n8n workflows المتاحة.
 */

import { NextResponse } from "next/server";
import { listWorkflowTemplates } from "@/lib/agents/n8n-templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const templates = listWorkflowTemplates();
  return NextResponse.json({
    count: templates.length,
    templates,
  });
}
