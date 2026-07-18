/**
 * Recipe Engine
 * ==============
 * بيـ execute recipes خطوة خطوة.
 * كل خطوة = MCP tool call.
 */

import { executeTool } from "./registry";
import { findRecipe, type Recipe } from "./recipes";

export interface RecipeSSEEvent {
  type: "recipe_start" | "step_start" | "step_end" | "recipe_done" | "error";
  recipe?: string;
  step?: number;
  totalSteps?: number;
  tool?: string;
  description?: string;
  result?: unknown;
  error?: string;
}

export type RecipeSSESink = (event: RecipeSSEEvent) => void;

/**
 * تنفيذ recipe كامل
 */
export async function runRecipe(
  userMessage: string,
  sink: RecipeSSESink,
): Promise<boolean> {
  const recipe = findRecipe(userMessage);

  if (!recipe) {
    return false;
  }

  sink({
    type: "recipe_start",
    recipe: recipe.name,
    totalSteps: recipe.steps.length,
  });

  // استخرج الموضوع من رسالة المستخدم (بعد الـ trigger word)
  let input = userMessage;
  for (const trigger of recipe.trigger) {
    const idx = input.toLowerCase().indexOf(trigger.toLowerCase());
    if (idx >= 0) {
      input = input.slice(idx + trigger.length).trim();
      break;
    }
  }
  if (!input) input = userMessage;

  const results: Record<string, unknown> = {};

  for (let i = 0; i < recipe.steps.length; i++) {
    const step = recipe.steps[i];

    sink({
      type: "step_start",
      step: i + 1,
      totalSteps: recipe.steps.length,
      tool: step.tool,
      description: step.description,
    });

    try {
      const params = step.params(input, results);
      const result = await executeTool(step.tool, params);

      results[step.outputKey] = result.success ? result.data : { error: result.error };

      sink({
        type: "step_end",
        step: i + 1,
        tool: step.tool,
        result: result.success ? result.data : { error: result.error },
      });
    } catch (e: any) {
      sink({
        type: "error",
        step: i + 1,
        tool: step.tool,
        error: e.message,
      });
      results[step.outputKey] = { error: e.message };
    }
  }

  sink({
    type: "recipe_done",
    recipe: recipe.name,
  });

  return true;
}
