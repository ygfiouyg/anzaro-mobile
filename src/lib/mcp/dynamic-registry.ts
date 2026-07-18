/**
 * Dynamic Tool Registry
 * ======================
 * بيقرأ الـ installed tools من الـ DB ويسجلها في الـ registry.
 * يستخدم real-executor لتشغيل الكود الأصلي (Python/Node/Java/C++).
 */

import type { MCPTool, MCPToolResult } from "./types";
import { db } from "@/lib/db";
import { executeRealTool, installTool, isToolInstalled } from "./real-executor";

let dynamicToolsCache: MCPTool[] | null = null;
let lastCacheTime = 0;
const CACHE_TTL = 60_000;

export async function getDynamicTools(): Promise<MCPTool[]> {
  if (dynamicToolsCache && Date.now() - lastCacheTime < CACHE_TTL) {
    return dynamicToolsCache;
  }

  try {
    const tools = await db.installedTool.findMany({
      where: { status: "approved" },
      select: {
        toolName: true,
        displayName: true,
        description: true,
        parameters: true,
        executeCode: true,
        codeFiles: true,
      },
    });

    dynamicToolsCache = [];

    for (const t of tools) {
      let params: any = { type: "object", properties: {}, required: [] };
      try { params = JSON.parse(t.parameters); } catch {}

      // parse codeFiles
      let files: Array<{ path: string; content: string }> = [];
      try { files = JSON.parse(t.codeFiles || "[]"); } catch {}

      // الـ executeCode فيه metadata كـ JSON: {language, entryFile, dependencies}
      let toolMeta: any = { language: "javascript", entryFile: "index.js", dependencies: [] };
      try { toolMeta = JSON.parse(t.executeCode); } catch {
        // لو مش JSON → ده JavaScript code قديم (vm sandbox)
        toolMeta = { language: "javascript", entryFile: "__inline__", dependencies: [], inlineCode: t.executeCode };
      }

      const toolName = t.toolName;
      const language = toolMeta.language;
      const entryFile = toolMeta.entryFile;
      const dependencies = toolMeta.dependencies || [];

      // لو الأداة مش مثبتة على الـ system → ثبّتها
      if (entryFile !== "__inline__" && !isToolInstalled(toolName) && files.length > 0) {
        console.log(`[DynamicRegistry] installing tool: ${toolName} (${language})`);
        const installResult = await installTool(toolName, language, files, dependencies);
        if (installResult.success) {
          console.log(`[DynamicRegistry] ✅ installed ${toolName}`);
        } else {
          console.warn(`[DynamicRegistry] ❌ install failed for ${toolName}: ${installResult.error}`);
        }
      }

      dynamicToolsCache.push({
        name: toolName,
        description: t.description,
        parameters: params,
        execute: async (args: Record<string, unknown>): Promise<MCPToolResult> => {
          // لو فيه inline code → استخدم vm sandbox (للتوافق مع القديم)
          if (toolMeta.inlineCode) {
            const { executeDynamicTool } = await import("./executor");
            return executeDynamicTool(toolName, toolMeta.inlineCode, args);
          }
          // استخدم real executor
          return executeRealTool(toolName, language, entryFile, args);
        },
      } as MCPTool);
    }

    lastCacheTime = Date.now();
    return dynamicToolsCache;
  } catch (e) {
    console.warn("[DynamicRegistry] Failed to load tools:", e);
    return [];
  }
}

export function clearDynamicToolsCache() {
  dynamicToolsCache = null;
  lastCacheTime = 0;
}

export async function isToolNameAvailable(name: string): Promise<boolean> {
  const existing = await db.installedTool.findUnique({ where: { toolName: name } });
  return !existing;
}

export default getDynamicTools;
