/**
 * Real Tool Executor
 * ==================
 * بينفّذ الكود الأصلي من GitHub repos بـ child_process.
 *
 * يدعم:
 * - Python (python3)
 * - Node.js (node)
 * - Java (java + javac)
 * - C/C++ (gcc)
 *
 * الـ flow:
 * 1. AI يحدد اللغة + entry file + dependencies
 * 2. نثبّت الـ dependencies (pip/npm)
 * 3. نشغّل الكود الأصلي بـ child_process
 * 4. نرجع النتيجة للـ AI
 */

import { exec, execSync } from "child_process";
import { promisify } from "util";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import path from "path";
import type { MCPToolResult } from "./types";

const execAsync = promisify(exec);

const TOOLS_DIR = "/tmp/anzaro-tools";
const INSTALL_TIMEOUT = 120_000; // 2 دقيقة لتثبيت dependencies
const EXEC_TIMEOUT = 60_000; // 1 دقيقة للتنفيذ

/** اتأكد إن مجلد الأدوات موجود */
function ensureToolsDir() {
  if (!existsSync(TOOLS_DIR)) {
    mkdirSync(TOOLS_DIR, { recursive: true });
  }
}

/** ثبّت Python dependencies */
async function installPythonDeps(toolDir: string, requirements: string[]): Promise<void> {
  if (requirements.length === 0) return;
  const reqContent = requirements.join("\n");
  const reqPath = path.join(toolDir, "requirements.txt");
  writeFileSync(reqPath, reqContent);
  console.log(`[RealExecutor] pip install -r requirements.txt (${requirements.length} packages)`);
  try {
    await execAsync(`cd ${toolDir} && pip3 install -r requirements.txt --quiet 2>&1`, {
      timeout: INSTALL_TIMEOUT,
      maxBuffer: 10 * 1024 * 1024,
    });
    console.log("[RealExecutor] pip install done ✅");
  } catch (e: any) {
    console.warn(`[RealExecutor] pip install failed: ${e.message?.slice(0, 200)}`);
    throw new Error(`فشل تثبيت Python dependencies: ${e.message?.slice(0, 200)}`);
  }
}

/** ثبّت Node.js dependencies */
async function installNodeDeps(toolDir: string, dependencies: string[]): Promise<void> {
  if (dependencies.length === 0) return;
  // اكتب package.json
  const packageJson = {
    name: "anzaro-tool",
    version: "1.0.0",
    dependencies: dependencies.reduce((acc, dep) => {
      // لو الـ dep بصيغة "name@version"
      const parts = dep.split("@");
      if (parts.length >= 2) {
        acc[parts[0]] = parts.slice(1).join("@");
      } else {
        acc[dep] = "latest";
      }
      return acc;
    }, {} as Record<string, string>),
  };
  writeFileSync(path.join(toolDir, "package.json"), JSON.stringify(packageJson, null, 2));
  console.log(`[RealExecutor] npm install (${dependencies.length} packages)`);
  try {
    await execAsync(`cd ${toolDir} && npm install --silent 2>&1`, {
      timeout: INSTALL_TIMEOUT,
      maxBuffer: 10 * 1024 * 1024,
    });
    console.log("[RealExecutor] npm install done ✅");
  } catch (e: any) {
    console.warn(`[RealExecutor] npm install failed: ${e.message?.slice(0, 200)}`);
    throw new Error(`فشل تثبيت Node.js dependencies: ${e.message?.slice(0, 200)}`);
  }
}

/** شغّل Python code */
async function executePython(toolDir: string, entryFile: string, args: Record<string, unknown>): Promise<any> {
  const filePath = path.join(toolDir, entryFile);
  if (!existsSync(filePath)) {
    // ممكن الـ entry file يكون محتاج يتكتب
    throw new Error(`ملف ${entryFile} مش موجود`);
  }
  // حوّل الـ args لـ JSON ومرّرها كـ environment variable
  const argsJson = JSON.stringify(args);
  console.log(`[RealExecutor] python3 ${entryFile} (args: ${argsJson.slice(0, 100)})`);
  try {
    const { stdout } = await execAsync(
      `cd ${toolDir} && ANZARO_ARGS='${argsJson.replace(/'/g, "'\\''")}' python3 ${entryFile} 2>&1`,
      { timeout: EXEC_TIMEOUT, maxBuffer: 10 * 1024 * 1024 },
    );
    // حاول parse كـ JSON
    try {
      return JSON.parse(stdout.trim());
    } catch {
      return { output: stdout.trim() };
    }
  } catch (e: any) {
    throw new Error(`Python execution failed: ${e.message?.slice(0, 500)}`);
  }
}

/** شغّل Node.js code */
async function executeNode(toolDir: string, entryFile: string, args: Record<string, unknown>): Promise<any> {
  const filePath = path.join(toolDir, entryFile);
  if (!existsSync(filePath)) {
    throw new Error(`ملف ${entryFile} مش موجود`);
  }
  const argsJson = JSON.stringify(args);
  console.log(`[RealExecutor] node ${entryFile} (args: ${argsJson.slice(0, 100)})`);
  try {
    const { stdout } = await execAsync(
      `cd ${toolDir} && ANZARO_ARGS='${argsJson.replace(/'/g, "'\\''")}' node ${entryFile} 2>&1`,
      { timeout: EXEC_TIMEOUT, maxBuffer: 10 * 1024 * 1024 },
    );
    try {
      return JSON.parse(stdout.trim());
    } catch {
      return { output: stdout.trim() };
    }
  } catch (e: any) {
    throw new Error(`Node.js execution failed: ${e.message?.slice(0, 500)}`);
  }
}

/** شغّل Java code */
async function executeJava(toolDir: string, entryFile: string, args: Record<string, unknown>): Promise<any> {
  const filePath = path.join(toolDir, entryFile);
  const className = entryFile.replace(".java", "");
  const argsJson = JSON.stringify(args);
  console.log(`[RealExecutor] java ${className}`);
  try {
    // compile first
    await execAsync(`cd ${toolDir} && javac ${entryFile} 2>&1`, { timeout: 30_000 });
    const { stdout } = await execAsync(
      `cd ${toolDir} && ANZARO_ARGS='${argsJson.replace(/'/g, "'\\''")}' java ${className} 2>&1`,
      { timeout: EXEC_TIMEOUT, maxBuffer: 10 * 1024 * 1024 },
    );
    try {
      return JSON.parse(stdout.trim());
    } catch {
      return { output: stdout.trim() };
    }
  } catch (e: any) {
    throw new Error(`Java execution failed: ${e.message?.slice(0, 500)}`);
  }
}

/** شغّل C/C++ code */
async function executeCpp(toolDir: string, entryFile: string, args: Record<string, unknown>): Promise<any> {
  const filePath = path.join(toolDir, entryFile);
  const outputPath = path.join(toolDir, "anzaro_tool_bin");
  const argsJson = JSON.stringify(args);
  console.log(`[RealExecutor] gcc ${entryFile} → execute`);
  try {
    // compile
    await execAsync(`cd ${toolDir} && gcc -o anzaro_tool_bin ${entryFile} 2>&1`, { timeout: 30_000 });
    const { stdout } = await execAsync(
      `cd ${toolDir} && ANZARO_ARGS='${argsJson.replace(/'/g, "'\\''")}' ./anzaro_tool_bin 2>&1`,
      { timeout: EXEC_TIMEOUT, maxBuffer: 10 * 1024 * 1024 },
    );
    try {
      return JSON.parse(stdout.trim());
    } catch {
      return { output: stdout.trim() };
    }
  } catch (e: any) {
    throw new Error(`C/C++ execution failed: ${e.message?.slice(0, 500)}`);
  }
}

/**
 * ثبّت أداة جديدة — اكتب ملفاتها + ثبّت dependencies.
 * بنستخدمها لما الأدمن يوافق على tool.
 */
export async function installTool(
  toolName: string,
  language: string,
  files: Array<{ path: string; content: string }>,
  dependencies: string[],
): Promise<{ success: boolean; error?: string; toolDir: string }> {
  ensureToolsDir();
  const toolDir = path.join(TOOLS_DIR, toolName);
  mkdirSync(toolDir, { recursive: true });

  // اكتب كل الملفات
  for (const file of files) {
    const filePath = path.join(toolDir, file.path);
    const fileDir = path.dirname(filePath);
    if (!existsSync(fileDir)) mkdirSync(fileDir, { recursive: true });
    writeFileSync(filePath, file.content);
    console.log(`[RealExecutor] wrote ${file.path} (${file.content.length} bytes)`);
  }

  // ثبّت dependencies
  try {
    if (language === "python") {
      await installPythonDeps(toolDir, dependencies);
    } else if (language === "javascript" || language === "typescript") {
      await installNodeDeps(toolDir, dependencies);
    }
    return { success: true, toolDir };
  } catch (e: any) {
    return { success: false, error: e.message, toolDir };
  }
}

/**
 * شغّل أداة مثبتة.
 */
export async function executeRealTool(
  toolName: string,
  language: string,
  entryFile: string,
  args: Record<string, unknown>,
): Promise<MCPToolResult> {
  const toolDir = path.join(TOOLS_DIR, toolName);
  if (!existsSync(toolDir)) {
    return { success: false, error: `الأداة "${toolName}" مش مثبتة على الـ system` };
  }

  try {
    let result: any;
    switch (language) {
      case "python":
        result = await executePython(toolDir, entryFile, args);
        break;
      case "javascript":
      case "typescript":
        result = await executeNode(toolDir, entryFile, args);
        break;
      case "java":
        result = await executeJava(toolDir, entryFile, args);
        break;
      case "c":
      case "cpp":
      case "c++":
        result = await executeCpp(toolDir, entryFile, args);
        break;
      default:
        return { success: false, error: `اللغة "${language}" مش مدعومة` };
    }

    if (result && result.error) {
      return { success: false, error: result.error };
    }
    return { success: true, data: result };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

/** اتأد إن الأداة مثبتة */
export function isToolInstalled(toolName: string): boolean {
  return existsSync(path.join(TOOLS_DIR, toolName));
}

/** قائمة اللغات المدعومة */
export const SUPPORTED_LANGUAGES = ["python", "javascript", "typescript", "java", "c", "cpp", "c++"];

export default executeRealTool;
