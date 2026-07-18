/**
 * Dynamic Tool Executor
 * =====================
 * بينفّذ كود الـ tool المسحوب من GitHub في sandbox آمن.
 *
 * الـ code بيتخزن كـ string في الـ DB. لما الـ tool تتـ callable:
 * 1. نقرا الكود
 * 2. نـ wrapه في function
 * 3. نـ executeه بـ vm.runInContext
 * 4. نرجع النتيجة
 */

import vm from "vm";
import type { MCPToolResult } from "./types";

/**
 * نفّذ كود الـ tool في sandbox.
 *
 * @param toolName اسم الأداة (للـ logging)
 * @param code الكود التنفيذي (JavaScript string)
 * @param args الـ parameters اللي الـ AI بعتها
 */
export async function executeDynamicTool(
  toolName: string,
  code: string,
  args: Record<string, unknown>,
): Promise<MCPToolResult> {
  console.log(`[DynamicExecutor] executing tool: ${toolName}(${JSON.stringify(args).slice(0, 100)})`);

  try {
    // الـ code لازم يكون JavaScript function body
    // الـ AI بيوّلده بصيغة: async function(params) { ... return result; }
    // إحنا بنـ wrapها وندعيها

    // جهّز الـ sandbox context
    const sandbox = {
      params: args,
      console: {
        log: (...msgs: any[]) => console.log(`[${toolName}]`, ...msgs),
        error: (...msgs: any[]) => console.error(`[${toolName}]`, ...msgs),
        warn: (...msgs: any[]) => console.warn(`[${toolName}]`, ...msgs),
      },
      fetch: globalThis.fetch.bind(globalThis),
      JSON,
      Date,
      Math,
      Object,
      Array,
      String,
      Number,
      Boolean,
      Promise,
      setTimeout,
      clearTimeout,
      URL,
      URLSearchParams,
      Buffer,
      TextEncoder,
      TextDecoder,
      crypto: globalThis.crypto,
      process: { env: {} }, // env فاضي للأمان
      result: null as any,
    };

    // wrap الـ code: نـ call الـ function وناخد النتيجة
    const wrappedCode = `
      (async () => {
        ${code}
        // الـ code لازم يعمل return للنتيجة
        // أو يعمل this.result = ...
      })().then(r => { result = r; }).catch(e => { result = { error: e.message }; });
    `;

    // execute في vm context
    const context = vm.createContext(sandbox);
    vm.runInContext(wrappedCode, context, {
      timeout: 30_000, // 30 ثانية max
      filename: `${toolName}.js`,
    });

    // انتظر النتيجة (الـ vm مش بيدعم await مباشر)
    await new Promise((resolve) => setTimeout(resolve, 100));

    const result = sandbox.result;

    if (result && result.error) {
      return { success: false, error: `[${toolName}] ${result.error}` };
    }

    return { success: true, data: result };
  } catch (e: any) {
    console.error(`[DynamicExecutor] tool ${toolName} failed:`, e);
    return {
      success: false,
      error: `فشل تنفيذ الأداة ${toolName}: ${e?.message || String(e)}`,
    };
  }
}

export default executeDynamicTool;
