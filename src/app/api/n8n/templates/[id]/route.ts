/**
 * GET /api/n8n/templates/[id]
 * ============================
 * احصل على قالب workflow واحد (metadata + workflow JSON + setup instructions).
 *
 * Query params:
 *   ?download=true  → يرجّع الـ workflow JSON كـ file download (للاستيراد المباشر في n8n)
 */

import { NextRequest, NextResponse } from "next/server";
import { getWorkflowById } from "@/lib/agents/n8n-templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const template = getWorkflowById(id);

  if (!template) {
    return NextResponse.json(
      { error: "not_found", message: `القالب "${id}" غير موجود` },
      { status: 404 },
    );
  }

  const url = new URL(request.url);
  const download = url.searchParams.get("download") === "true";

  if (download) {
    // Return as downloadable JSON file (for n8n import)
    const jsonStr = JSON.stringify(template.workflow, null, 2);
    return new NextResponse(jsonStr, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${template.id}.json"`,
      },
    });
  }

  return NextResponse.json({
    id: template.id,
    name: template.name,
    nameAr: template.nameAr,
    description: template.description,
    category: template.category,
    icon: template.icon,
    requiredEnvVars: template.requiredEnvVars || [],
    setupInstructions: template.setupInstructions,
    workflow: template.workflow,
  });
}
