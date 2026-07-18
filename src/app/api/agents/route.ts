/**
 * GET  /api/agents  — قائمة كل الوكلاء المخصصين
 * POST /api/agents  — إنشاء وكيل جديد
 *
 * Body for POST:
 *   {
 *     "name":         string,  // required
 *     "nameEn"?:      string,
 *     "description":  string,  // required
 *     "icon"?:        string,  // default "🤖"
 *     "color"?:       string,  // default gradient
 *     "systemPrompt": string,  // required
 *     "tools":        string[], // required — list of tool names from catalog
 *     "suggestions"?: string[], // example prompts
 *     "category"?:    string,  // default "custom"
 *     "isPublic"?:    boolean  // default false
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { AGENT_TOOL_CATALOG, isValidToolName } from "@/lib/agents/catalog";
import { withAuth, type AuthContext } from "@/lib/with-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Valid tool names (curated only — MCP tools validated async below)
const VALID_CURATED_TOOL_NAMES = new Set(AGENT_TOOL_CATALOG.map((t) => t.name));

// ── GET: list all agents ─────────────────────────────────────
export const GET = withAuth(async (req: NextRequest, _ctx) => {
  try {
    const agents = await db.customAgent.findMany({
      orderBy: [{ createdAt: "desc" }],
      take: 200,
    });

    // Parse JSON fields
    const parsed = agents.map((a) => ({
      id: a.id,
      name: a.name,
      nameEn: a.nameEn,
      description: a.description,
      icon: a.icon,
      color: a.color,
      systemPrompt: a.systemPrompt,
      tools: JSON.parse(a.toolsJson || "[]") as string[],
      suggestions: a.suggestionsJson ? (JSON.parse(a.suggestionsJson) as string[]) : [],
      category: a.category,
      isPublic: a.isPublic,
      runCount: a.runCount,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    }));

    return NextResponse.json({ agents: parsed, count: parsed.length });
  } catch (e: any) {
    return NextResponse.json(
      { error: "fetch_failed", message: e.message },
      { status: 500 },
    );
  }
});

// ── POST: create new agent ───────────────────────────────────
export const POST = withAuth(async (req: NextRequest, _ctx) => {
  try {
    const body = await req.json();

    // Validate required fields
    const name = String(body.name || "").trim();
    const description = String(body.description || "").trim();
    const systemPrompt = String(body.systemPrompt || "").trim();
    const tools: string[] = Array.isArray(body.tools) ? body.tools : [];

    if (!name) {
      return NextResponse.json(
        { error: "missing_name", message: "الاسم مطلوب" },
        { status: 400 },
      );
    }
    if (!description) {
      return NextResponse.json(
        { error: "missing_description", message: "الوصف مطلوب" },
        { status: 400 },
      );
    }
    if (!systemPrompt) {
      return NextResponse.json(
        { error: "missing_system_prompt", message: "system prompt مطلوب" },
        { status: 400 },
      );
    }
    if (tools.length === 0) {
      return NextResponse.json(
        { error: "missing_tools", message: "اختار أداة واحدة على الأقل" },
        { status: 400 },
      );
    }

    // Validate tool names (curated + MCP registry)
    const invalidTools: string[] = [];
    for (const t of tools) {
      if (VALID_CURATED_TOOL_NAMES.has(t)) continue;
      const valid = await isValidToolName(t);
      if (!valid) invalidTools.push(t);
    }
    if (invalidTools.length > 0) {
      return NextResponse.json(
        {
          error: "invalid_tools",
          message: `أدوات غير صالحة: ${invalidTools.join(", ")}`,
        },
        { status: 400 },
      );
    }

    // Optional fields with defaults
    const icon = String(body.icon || "🤖").trim().slice(0, 8) || "🤖";
    const color = String(body.color || "from-violet-500 to-fuchsia-500").trim();
    const nameEn = body.nameEn ? String(body.nameEn).trim() : null;
    const category = String(body.category || "custom").trim();
    const isPublic = Boolean(body.isPublic);
    const suggestions: string[] = Array.isArray(body.suggestions)
      ? body.suggestions.map((s: unknown) => String(s).trim()).filter(Boolean).slice(0, 10)
      : [];

    const created = await db.customAgent.create({
      data: {
        name,
        nameEn,
        description,
        icon,
        color,
        systemPrompt,
        toolsJson: JSON.stringify(tools),
        suggestionsJson: suggestions.length > 0 ? JSON.stringify(suggestions) : null,
        category,
        isPublic,
      },
    });

    return NextResponse.json(
      {
        success: true,
        agent: {
          id: created.id,
          name: created.name,
          nameEn: created.nameEn,
          description: created.description,
          icon: created.icon,
          color: created.color,
          systemPrompt: created.systemPrompt,
          tools,
          suggestions,
          category: created.category,
          isPublic: created.isPublic,
          runCount: created.runCount,
          createdAt: created.createdAt,
          updatedAt: created.updatedAt,
        },
      },
      { status: 201 },
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: "create_failed", message: e.message },
      { status: 500 },
    );
  }
});
