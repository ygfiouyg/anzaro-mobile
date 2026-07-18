/**
 * /api/recipes
 * ============
 * Endpoint لسلسلة الأدوات الجاهزة (Recipes).
 *
 * GET  /api/recipes            — قائمة كل الـ recipes المتاحة
 * GET  /api/recipes?id=xxx     — تفاصيل recipe واحدة
 * POST /api/recipes            — شغّل recipe عبر SSE stream
 *      Body: { "message": string }   — رسالة المستخدم (بنكتشف الـ recipe المناسب تلقائيًا)
 *      أو   { "id": string, "input"?: string }  — تشغيل recipe محدد مباشرة
 *
 * الـ SSE events:
 *   recipe_start | step_start | step_end | recipe_done | error
 *
 * Headers:
 *   Authorization: Bearer <token>   // required
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { listRecipes, findRecipe, RECIPES } from "@/lib/mcp/recipes";
import { runRecipe, type RecipeSSEEvent } from "@/lib/mcp/recipe-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────────────────
// GET — list recipes or inspect one
// ─────────────────────────────────────────────────────────────────────────────
export const GET = withAuth(async (request: NextRequest) => {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const recipe = RECIPES.find((r) => r.id === id);
    if (!recipe) {
      return NextResponse.json(
        {
          success: false,
          error: "recipe_not_found",
          message: `recipe "${id}" غير موجودة`,
        },
        { status: 404 },
      );
    }
    return NextResponse.json({
      success: true,
      recipe: {
        id: recipe.id,
        name: recipe.name,
        description: recipe.description,
        trigger: recipe.trigger,
        steps: recipe.steps.map((s, i) => ({
          index: i + 1,
          tool: s.tool,
          description: s.description,
          outputKey: s.outputKey,
        })),
      },
    });
  }

  const recipes = listRecipes();
  return NextResponse.json({
    success: true,
    count: recipes.length,
    recipes,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST — run a recipe (SSE stream)
// ─────────────────────────────────────────────────────────────────────────────
interface RunRecipeBody {
  /** رسالة المستخدم — بنكتشف الـ recipe المناسب تلقائيًا */
  message?: string;
  /** أو حدد recipe id مباشرة */
  id?: string;
  /** مدخل مخصص لتمريره للـ recipe بدل الـ message */
  input?: string;
}

export const POST = withAuth(async (request: NextRequest) => {
  let body: RunRecipeBody;
  try {
    body = (await request.json()) as RunRecipeBody;
  } catch {
    return NextResponse.json(
      { success: false, error: "invalid_json", message: "الـ body لازم يكون JSON صالح" },
      { status: 400 },
    );
  }

  // 1) حدد الـ recipe
  let recipeId: string | null = null;
  let userMessage = "";

  if (body.id) {
    recipeId = body.id.trim();
    userMessage = (body.input || body.message || body.id).trim();
    // Validate recipe exists
    const exists = RECIPES.find((r) => r.id === recipeId);
    if (!exists) {
      return NextResponse.json(
        {
          success: false,
          error: "recipe_not_found",
          message: `recipe "${recipeId}" غير موجودة`,
        },
        { status: 404 },
      );
    }
  } else if (body.message) {
    userMessage = body.message.trim();
    const detected = findRecipe(userMessage);
    if (!detected) {
      return NextResponse.json(
        {
          success: false,
          error: "no_matching_recipe",
          message:
            "مفيش recipe مناسب لرسالتك. جرّب كلمات زي: 'اعمل فيديو'، 'تقويم محتوى'، 'بحث عميق'، 'تحليل علامة'، 'الجو'، 'rss'، 'مستند'...",
          availableRecipes: listRecipes().map((r) => ({ id: r.id, name: r.name })),
        },
        { status: 404 },
      );
    }
    recipeId = detected.id;
  } else {
    return NextResponse.json(
      {
        success: false,
        error: "missing_input",
        message: "لازم تبعت `message` أو `id` في الـ body",
      },
      { status: 400 },
    );
  }

  if (!userMessage) {
    return NextResponse.json(
      { success: false, error: "missing_message", message: "message/input مطلوبة" },
      { status: 400 },
    );
  }

  // 2) SSE stream
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: RecipeSSEEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        const ran = await runRecipe(userMessage, send);
        if (!ran) {
          send({
            type: "error",
            error: `لا فيه recipe يناسب: "${userMessage.slice(0, 100)}"`,
          });
        }
      } catch (e: any) {
        send({ type: "error", error: e?.message || "recipe_failed" });
      } finally {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
});
