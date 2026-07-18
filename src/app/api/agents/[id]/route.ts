/**
 * GET    /api/agents/[id]  — احصل على وكيل واحد
 * PATCH  /api/agents/[id]  — عدّل وكيل
 * DELETE /api/agents/[id]  — احذف وكيل
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { AGENT_TOOL_CATALOG, isValidToolName } from "@/lib/agents/catalog";
import { withAuth, type AuthContext } from "@/lib/with-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_CURATED_TOOL_NAMES = new Set(AGENT_TOOL_CATALOG.map((t) => t.name));

interface Params {
  params: Promise<{ id: string }>;
}

// ── GET: fetch single agent ──────────────────────────────────
export const GET = withAuth(async (_req: NextRequest, { params }: Params) => {
  try {
    const { id } = await params;
    const agent = await db.customAgent.findUnique({ where: { id } });
    if (!agent) {
      return NextResponse.json(
        { error: "not_found", message: "الوكيل غير موجود" },
        { status: 404 },
      );
    }
    return NextResponse.json({
      agent: {
        id: agent.id,
        name: agent.name,
        nameEn: agent.nameEn,
        description: agent.description,
        icon: agent.icon,
        color: agent.color,
        systemPrompt: agent.systemPrompt,
        tools: JSON.parse(agent.toolsJson || "[]") as string[],
        suggestions: agent.suggestionsJson ? (JSON.parse(agent.suggestionsJson) as string[]) : [],
        category: agent.category,
        isPublic: agent.isPublic,
        runCount: agent.runCount,
        createdAt: agent.createdAt,
        updatedAt: agent.updatedAt,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "fetch_failed", message: e.message },
      { status: 500 },
    );
  }
});

// ── PATCH: update agent ──────────────────────────────────────
export const PATCH = withAuth(async (req: NextRequest, { params }: Params) => {
  try {
    const { id } = await params;
    const body = await req.json();

    // Verify exists
    const existing = await db.customAgent.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "not_found", message: "الوكيل غير موجود" },
        { status: 404 },
      );
    }

    // Build update data (only allowed fields)
    const update: Record<string, unknown> = {};

    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (!name) {
        return NextResponse.json(
          { error: "invalid_name", message: "الاسم ما يقدرش يكون فاضي" },
          { status: 400 },
        );
      }
      update.name = name;
    }
    if (typeof body.description === "string") {
      const description = body.description.trim();
      if (!description) {
        return NextResponse.json(
          { error: "invalid_description", message: "الوصف ما يقدرش يكون فاضي" },
          { status: 400 },
        );
      }
      update.description = description;
    }
    if (typeof body.systemPrompt === "string") {
      const sp = body.systemPrompt.trim();
      if (!sp) {
        return NextResponse.json(
          { error: "invalid_system_prompt", message: "system prompt ما يقدرش يكون فاضي" },
          { status: 400 },
        );
      }
      update.systemPrompt = sp;
    }
    if (typeof body.icon === "string") {
      update.icon = body.icon.trim().slice(0, 8) || "🤖";
    }
    if (typeof body.color === "string") {
      update.color = body.color.trim();
    }
    if (typeof body.nameEn === "string") {
      update.nameEn = body.nameEn.trim() || null;
    }
    if (typeof body.category === "string") {
      update.category = body.category.trim();
    }
    if (typeof body.isPublic === "boolean") {
      update.isPublic = body.isPublic;
    }
    if (Array.isArray(body.tools)) {
      const tools: string[] = body.tools;
      // Validate each tool (curated + MCP registry)
      const invalid: string[] = [];
      for (const t of tools) {
        if (VALID_CURATED_TOOL_NAMES.has(t)) continue;
        const valid = await isValidToolName(t);
        if (!valid) invalid.push(t);
      }
      if (invalid.length > 0) {
        return NextResponse.json(
          {
            error: "invalid_tools",
            message: `أدوات غير صالحة: ${invalid.join(", ")}`,
          },
          { status: 400 },
        );
      }
      if (tools.length === 0) {
        return NextResponse.json(
          { error: "missing_tools", message: "اختار أداة واحدة على الأقل" },
          { status: 400 },
        );
      }
      update.toolsJson = JSON.stringify(tools);
    }
    if (Array.isArray(body.suggestions)) {
      const suggestions = body.suggestions
        .map((s: unknown) => String(s).trim())
        .filter(Boolean)
        .slice(0, 10);
      update.suggestionsJson = suggestions.length > 0 ? JSON.stringify(suggestions) : null;
    }

    const updated = await db.customAgent.update({
      where: { id },
      data: update,
    });

    return NextResponse.json({
      success: true,
      agent: {
        id: updated.id,
        name: updated.name,
        nameEn: updated.nameEn,
        description: updated.description,
        icon: updated.icon,
        color: updated.color,
        systemPrompt: updated.systemPrompt,
        tools: JSON.parse(updated.toolsJson || "[]") as string[],
        suggestions: updated.suggestionsJson ? (JSON.parse(updated.suggestionsJson) as string[]) : [],
        category: updated.category,
        isPublic: updated.isPublic,
        runCount: updated.runCount,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "update_failed", message: e.message },
      { status: 500 },
    );
  }
});

// ── DELETE: remove agent ─────────────────────────────────────
export const DELETE = withAuth(async (_req: NextRequest, { params }: Params) => {
  try {
    const { id } = await params;
    const existing = await db.customAgent.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "not_found", message: "الوكيل غير موجود" },
        { status: 404 },
      );
    }
    await db.customAgent.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: "delete_failed", message: e.message },
      { status: 500 },
    );
  }
});
