/**
 * GET /api/agents/recipes
 * ========================
 * قائمة كل الـ recipes المتاحة (metadata فقط).
 *
 * POST /api/agents/recipes
 * ========================
 * Import recipe كوكيل جديد في الـ DB.
 * Body: { "recipeId": "video_creation" }
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { RECIPES, getRecipeById, recipeToAgent } from "@/lib/agents/recipes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── GET: list recipes ────────────────────────────────────────
export async function GET() {
  return NextResponse.json({
    count: RECIPES.length,
    recipes: RECIPES.map((r) => ({
      id: r.id,
      name: r.name,
      nameEn: r.nameEn,
      description: r.description,
      icon: r.icon,
      color: r.color,
      category: r.category,
      tools: r.tools,
      toolsCount: r.tools.length,
      suggestionsCount: r.suggestions.length,
      exampleUseCase: r.exampleUseCase,
    })),
  });
}

// ── POST: import recipe as agent ─────────────────────────────
interface ImportBody {
  recipeId?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ImportBody;
    const recipeId = String(body.recipeId || "").trim();

    if (!recipeId) {
      return NextResponse.json(
        { error: "missing_recipe_id", message: "recipeId مطلوب" },
        { status: 400 },
      );
    }

    const recipe = getRecipeById(recipeId);
    if (!recipe) {
      return NextResponse.json(
        { error: "recipe_not_found", message: `Recipe "${recipeId}" غير موجود` },
        { status: 404 },
      );
    }

    // Check if this recipe was already imported (by nameEn)
    const existing = await db.customAgent.findFirst({
      where: { nameEn: recipe.nameEn },
    });

    if (existing) {
      // Return the existing agent instead of duplicating
      return NextResponse.json({
        success: true,
        alreadyExists: true,
        agent: {
          id: existing.id,
          name: existing.name,
          nameEn: existing.nameEn,
          description: existing.description,
          icon: existing.icon,
          color: existing.color,
          systemPrompt: existing.systemPrompt,
          tools: JSON.parse(existing.toolsJson || "[]") as string[],
          suggestions: existing.suggestionsJson ? (JSON.parse(existing.suggestionsJson) as string[]) : [],
          category: existing.category,
          isPublic: existing.isPublic,
          runCount: existing.runCount,
        },
        message: `Recipe "${recipe.name}" كان مستورد بالفعل (id: ${existing.id})`,
      });
    }

    // Convert recipe to agent data + save
    const agentData = recipeToAgent(recipe);
    const created = await db.customAgent.create({
      data: {
        name: agentData.name,
        nameEn: agentData.nameEn,
        description: agentData.description,
        icon: agentData.icon,
        color: agentData.color,
        systemPrompt: agentData.systemPrompt,
        toolsJson: JSON.stringify(agentData.tools),
        suggestionsJson: JSON.stringify(agentData.suggestions),
        category: agentData.category,
        isPublic: agentData.isPublic,
      },
    });

    return NextResponse.json({
      success: true,
      agent: {
        id: created.id,
        name: created.name,
        nameEn: created.nameEn,
        description: created.description,
        icon: created.icon,
        color: created.color,
        systemPrompt: created.systemPrompt,
        tools: agentData.tools,
        suggestions: agentData.suggestions,
        category: created.category,
        isPublic: created.isPublic,
      },
      message: `تم استيراد Recipe "${recipe.name}" كوكيل جديد`,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "import_failed", message: e.message },
      { status: 500 },
    );
  }
}
