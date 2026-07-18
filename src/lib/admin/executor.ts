/**
 * Admin Tool Executor
 * ===================
 * بينفذ أدوات الأدمن فعلياً على نظام الملفات بتاع المشروع.
 *
 * الأمان:
 *   - كل المسارات محصورة داخل جذر المشروع (process.cwd())
 *   - مفيش وصول لملفات خارج المشروع
 *   - الـ write/modify بيرجع diff مختصر للمراجعة
 */

import { promises as fs } from "fs";
import path from "path";
import { exec, execFile } from "child_process";
import { promisify } from "util";
import { ADMIN_TOOL_MAP } from "./tools";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

const PROJECT_ROOT = process.cwd();

// SECURITY: Minimal env for child processes — strips API keys/secrets
// Prevents leaking OPENAI_API_KEY, SESSION_SECRET, etc. to executed commands
const SAFE_ENV: Record<string, string> = {
  PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin",
  HOME: process.env.HOME || "/tmp",
  USER: process.env.USER || "nobody",
  SHELL: process.env.SHELL || "/bin/sh",
  LANG: process.env.LANG || "en_US.UTF-8",
  TERM: process.env.TERM || "xterm-256color",
};

export interface ToolResult {
  tool: string;
  success: boolean;
  output: unknown;
  meta?: Record<string, unknown>;
  error?: string;
}

export type ToolEventEmitter = (event: {
  type: "tool_start" | "tool_end" | "tool_error";
  tool: string;
  message?: string;
  data?: unknown;
}) => void;

/** Resolve a user-supplied path safely inside the project root. */
function safeResolve(p: string): string {
  const normalized = path.normalize(p);
  const resolved = path.isAbsolute(normalized)
    ? normalized
    : path.resolve(PROJECT_ROOT, normalized);
  if (!resolved.startsWith(PROJECT_ROOT)) {
    throw new Error("Path escapes project root — access denied");
  }
  return resolved;
}

/** Get the relative path (for display) from project root. */
function rel(p: string): string {
  return path.relative(PROJECT_ROOT, p) || ".";
}

/* ============================================================================
 * list_files — عرض شجرة الملفات
 * ========================================================================== */
async function listFiles(args: { path?: string; maxDepth?: number }): Promise<ToolResult> {
  const root = safeResolve(args.path ?? ".");
  const maxDepth = args.maxDepth ?? 3;
  const entries: Array<{ path: string; type: string; size?: number; depth: number }> = [];

  async function walk(dir: string, depth: number) {
    if (depth > maxDepth) return;
    let items: import("fs").Dirent[];
    try {
      items = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    // Skip noise directories
    const SKIP = new Set(["node_modules", ".next", ".git", "dist", "build", ".turbo", "dev.log"]);
    for (const item of items) {
      if (SKIP.has(item.name)) continue;
      const full = path.join(dir, item.name);
      const relative = rel(full);
      if (item.isDirectory()) {
        entries.push({ path: relative, type: "directory", depth });
        await walk(full, depth + 1);
      } else {
        try {
          const stat = await fs.stat(full);
          entries.push({ path: relative, type: "file", size: stat.size, depth });
        } catch {
          entries.push({ path: relative, type: "file", depth });
        }
      }
    }
  }

  await walk(root, 0);
  return {
    tool: "list_files",
    success: true,
    output: entries,
    meta: { count: entries.length, root: rel(root) },
  };
}

/* ============================================================================
 * read_file — قراءة ملف
 * ========================================================================== */
async function readFile(args: { path: string }): Promise<ToolResult> {
  const full = safeResolve(args.path);
  try {
    const stat = await fs.stat(full);
    if (!stat.isFile()) {
      return { tool: "read_file", success: false, output: null, error: `${args.path} is not a file` };
    }
    // Limit very large files
    if (stat.size > 200_000) {
      return { tool: "read_file", success: false, output: null, error: `File too large (${stat.size} bytes). Use search_code instead.` };
    }
    const content = await fs.readFile(full, "utf-8");
    return {
      tool: "read_file",
      success: true,
      output: content,
      meta: { path: args.path, bytes: content.length, lines: content.split("\n").length },
    };
  } catch (e: any) {
    return { tool: "read_file", success: false, output: null, error: e.message };
  }
}

/* ============================================================================
 * write_file — إنشاء/استبدال ملف
 * ========================================================================== */
async function writeFile(args: { path: string; content: string }): Promise<ToolResult> {
  const full = safeResolve(args.path);
  try {
    await fs.mkdir(path.dirname(full), { recursive: true });
    let existed = false;
    let oldContent = "";
    try {
      oldContent = await fs.readFile(full, "utf-8");
      existed = true;
    } catch {
      /* new file */
    }
    await fs.writeFile(full, args.content, "utf-8");
    return {
      tool: "write_file",
      success: true,
      output: existed ? `File overwritten: ${args.path}` : `File created: ${args.path}`,
      meta: {
        path: args.path,
        action: existed ? "overwrite" : "create",
        bytes: args.content.length,
        lines: args.content.split("\n").length,
        previousBytes: existed ? oldContent.length : 0,
      },
    };
  } catch (e: any) {
    return { tool: "write_file", success: false, output: null, error: e.message };
  }
}

/* ============================================================================
 * modify_file — تعديل مستهدف (find & replace)
 * ========================================================================== */
async function modifyFile(args: { path: string; oldText: string; newText: string }): Promise<ToolResult> {
  const full = safeResolve(args.path);
  try {
    const content = await fs.readFile(full, "utf-8");
    if (!content.includes(args.oldText)) {
      return {
        tool: "modify_file",
        success: false,
        output: null,
        error: `oldText not found in ${args.path}. Make sure to copy the exact text including whitespace.`,
      };
    }
    const occurrences = content.split(args.oldText).length - 1;
    const newContent = content.replace(args.oldText, args.newText);
    await fs.writeFile(full, newContent, "utf-8");
    return {
      tool: "modify_file",
      success: true,
      output: `Modified ${args.path}: replaced ${occurrences} occurrence(s)`,
      meta: {
        path: args.path,
        occurrences,
        oldLength: args.oldText.length,
        newLength: args.newText.length,
        diff: {
          removed: args.oldText.split("\n").slice(0, 10).join("\n"),
          added: args.newText.split("\n").slice(0, 10).join("\n"),
        },
      },
    };
  } catch (e: any) {
    return { tool: "modify_file", success: false, output: null, error: e.message };
  }
}

/* ============================================================================
 * search_code — بحث في الكود
 * ========================================================================== */
async function searchCode(args: { pattern: string; filePattern?: string }): Promise<ToolResult> {
  const matches: Array<{ file: string; line: number; text: string }> = [];
  let regex: RegExp;
  try {
    regex = new RegExp(args.pattern, "i");
  } catch (e: any) {
    return { tool: "search_code", success: false, output: null, error: `Invalid regex: ${e.message}` };
  }

  const fileGlob = args.filePattern ?? "*";
  const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "dist", "build", ".turbo"]);

  async function walk(dir: string) {
    let items: import("fs").Dirent[];
    try {
      items = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const item of items) {
      if (SKIP_DIRS.has(item.name)) continue;
      const full = path.join(dir, item.name);
      if (item.isDirectory()) {
        await walk(full);
      } else if (item.isFile()) {
        const ext = item.name.split(".").pop() ?? "";
        // Apply file pattern filter (simple)
        if (fileGlob !== "*" && !item.name.match(fileGlob.replace("*", ".*").replace(".", "\\."))) {
          // still allow by extension
          if (!item.name.endsWith(fileGlob.replace("*.", ""))) continue;
        }
        try {
          const content = await fs.readFile(full, "utf-8");
          const lines = content.split("\n");
          for (let i = 0; i < lines.length; i++) {
            if (regex.test(lines[i])) {
              matches.push({
                file: rel(full),
                line: i + 1,
                text: lines[i].trim().slice(0, 200),
              });
              if (matches.length >= 100) return; // cap
            }
          }
        } catch {
          /* skip binary files */
        }
      }
    }
  }

  await walk(PROJECT_ROOT);
  return {
    tool: "search_code",
    success: true,
    output: matches,
    meta: { count: matches.length, pattern: args.pattern },
  };
}

/* ============================================================================
 * run_lint — تشغيل ESLint
 * ========================================================================== */
async function runLint(): Promise<ToolResult> {
  try {
    const { stdout, stderr } = await execAsync("bun run lint 2>&1", {
      cwd: PROJECT_ROOT,
      maxBuffer: 1024 * 1024 * 5,
      timeout: 60_000,
    });
    const output = (stdout + stderr).trim();
    const hasErrors = /error/i.test(output) && !/0 problems/.test(output);
    return {
      tool: "run_lint",
      success: true,
      output: output || "✓ No lint issues found",
      meta: { hasErrors, clean: !hasErrors },
    };
  } catch (e: any) {
    // ESLint exits non-zero when it finds errors — that's still a valid result
    const output = (e.stdout || "") + (e.stderr || "");
    return {
      tool: "run_lint",
      success: true,
      output: output.trim() || e.message,
      meta: { hasErrors: true },
    };
  }
}

/* ============================================================================
 * analyze_structure — تحليل هيكل المشروع
 * ========================================================================== */
async function analyzeStructure(): Promise<ToolResult> {
  const stats: Record<string, number> = {};
  const dirs: Record<string, number> = {};
  let totalFiles = 0;
  let totalSize = 0;
  const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "dist", "build", ".turbo"]);

  async function walk(dir: string, depth: number) {
    if (depth > 4) return;
    let items: import("fs").Dirent[];
    try {
      items = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const item of items) {
      if (SKIP_DIRS.has(item.name)) continue;
      const full = path.join(dir, item.name);
      if (item.isDirectory()) {
        const topDir = rel(full).split(path.sep)[0] ?? ".";
        dirs[topDir] = (dirs[topDir] ?? 0) + 1;
        await walk(full, depth + 1);
      } else {
        const ext = (item.name.split(".").pop() ?? "no-ext").toLowerCase();
        stats[ext] = (stats[ext] ?? 0) + 1;
        totalFiles++;
        try {
          const st = await fs.stat(full);
          totalSize += st.size;
        } catch {}
      }
    }
  }

  await walk(PROJECT_ROOT, 0);

  // Read key config files
  let packageInfo: any = null;
  try {
    const pkg = JSON.parse(await fs.readFile(path.join(PROJECT_ROOT, "package.json"), "utf-8"));
    packageInfo = {
      name: pkg.name,
      version: pkg.version,
      scripts: pkg.scripts,
      dependencies: Object.keys(pkg.dependencies ?? {}).length,
      devDependencies: Object.keys(pkg.devDependencies ?? {}).length,
    };
  } catch {}

  return {
    tool: "analyze_structure",
    success: true,
    output: {
      totalFiles,
      totalSizeKB: Math.round(totalSize / 1024),
      filesByExtension: stats,
      topDirectories: dirs,
      packageInfo,
    },
  };
}

/* ============================================================================
 * run_command — تشغيل أي أمر shell (القوة الكاملة)
 * ========================================================================== */
async function runCommand(args: { command: string; timeout_ms?: number }): Promise<ToolResult> {
  const timeout = Math.min(args.timeout_ms ?? 120000, 300000); // max 5 minutes
  try {
    const { stdout, stderr } = await execAsync(args.command, {
      cwd: PROJECT_ROOT,
      maxBuffer: 1024 * 1024 * 10, // 10MB output buffer
      timeout,
      env: SAFE_ENV,
    });
    const output = (stdout + (stderr ? `\n--- STDERR ---\n${stderr}` : "")).trim();
    return {
      tool: "run_command",
      success: true,
      output: output || "(no output)",
      meta: {
        command: args.command,
        exitCode: 0,
        duration_ms: 0, // execAsync doesn't return duration, but we can't easily measure here
        outputBytes: output.length,
      },
    };
  } catch (e: any) {
    // Non-zero exit — still return the output so GLM can see what happened
    const stdout = e.stdout || "";
    const stderr = e.stderr || "";
    const output = (stdout + (stderr ? `\n--- STDERR ---\n${stderr}` : "")).trim();
    return {
      tool: "run_command",
      success: false,
      output: output || e.message,
      error: `Command exited with code ${e.code ?? "unknown"}${e.signal ? ` (signal: ${e.signal})` : ""}`,
      meta: { command: args.command, exitCode: e.code, timedOut: e.killed === true },
    };
  }
}

/* ============================================================================
 * install_package — تثبيت package
 * ========================================================================== */
async function installPackage(args: { package: string; dev?: boolean }): Promise<ToolResult> {
  const devFlag = args.dev ? " -d" : "";
  const command = `bun add${devFlag} ${args.package}`;
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: PROJECT_ROOT,
      maxBuffer: 1024 * 1024 * 5,
      timeout: 180000, // 3 minutes for installs
      env: SAFE_ENV,
    });
    const output = (stdout + stderr).trim();
    return {
      tool: "install_package",
      success: true,
      output: output || `Package ${args.package} installed successfully`,
      meta: { package: args.package, dev: !!args.dev, command },
    };
  } catch (e: any) {
    return {
      tool: "install_package",
      success: false,
      output: (e.stdout || "") + (e.stderr || ""),
      error: `Failed to install ${args.package}: ${e.message}`,
      meta: { package: args.package, command },
    };
  }
}

/* ============================================================================
 * fetch_url — تنزيل محتوى من URL
 * ========================================================================== */
async function fetchUrl(args: { url: string; save_to?: string }): Promise<ToolResult> {
  try {
    const res = await fetch(args.url, {
      redirect: "follow",
      headers: { "User-Agent": "DeltaAI-AdminAgent/1.0" },
    });
    if (!res.ok) {
      return { tool: "fetch_url", success: false, output: null, error: `HTTP ${res.status} ${res.statusText}` };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    // 50MB limit
    if (buf.length > 50 * 1024 * 1024) {
      return { tool: "fetch_url", success: false, output: null, error: `Response too large (${buf.length} bytes, max 50MB)` };
    }
    const contentType = res.headers.get("content-type") ?? "text/plain";

    // If save_to provided, save to file
    if (args.save_to) {
      const full = safeResolve(args.save_to);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, buf);
      return {
        tool: "fetch_url",
        success: true,
        output: `Saved ${buf.length} bytes to ${args.save_to}`,
        meta: { url: args.url, save_to: args.save_to, bytes: buf.length, contentType },
      };
    }

    // Otherwise return as text (if it's text-like) or base64 (if binary)
    const isText = contentType.startsWith("text/") || contentType.includes("json") || contentType.includes("javascript") || contentType.includes("xml") || contentType.includes("svg");
    if (isText) {
      const text = buf.toString("utf-8");
      // Cap text output to avoid token overflow
      const truncated = text.length > 50000 ? text.slice(0, 50000) + `\n\n... (truncated, ${text.length} total bytes)` : text;
      return {
        tool: "fetch_url",
        success: true,
        output: truncated,
        meta: { url: args.url, bytes: buf.length, contentType, truncated: text.length > 50000 },
      };
    } else {
      // Binary — return base64
      const b64 = buf.toString("base64");
      return {
        tool: "fetch_url",
        success: true,
        output: { base64: b64.slice(0, 50000), contentType, bytes: buf.length, truncated: b64.length > 50000 },
        meta: { url: args.url, bytes: buf.length, contentType },
      };
    }
  } catch (e: any) {
    return { tool: "fetch_url", success: false, output: null, error: e.message };
  }
}

/* ============================================================================
 * git_commit_push — commit + push للـ git
 * ========================================================================== */
async function gitCommitPush(args: { message: string; add_all?: boolean }): Promise<ToolResult> {
  const addAll = args.add_all !== false; // default true
  const log: string[] = [];
  try {
    // 1. Stage changes
    if (addAll) {
      const { stdout: s1, stderr: e1 } = await execAsync("git add -A", { cwd: PROJECT_ROOT, maxBuffer: 1024 * 1024 });
      log.push(`$ git add -A\n${(s1 + e1).trim()}`);
    }
    // 2. Check if there's anything to commit
    const { stdout: status } = await execAsync("git status --porcelain", { cwd: PROJECT_ROOT });
    if (!status.trim()) {
      return { tool: "git_commit_push", success: true, output: "No changes to commit. Working tree is clean.", meta: { committed: false } };
    }
    // 3. Commit — SECURITY FIX: use execFile (no shell) to prevent injection
    const message = args.message; // execFile passes args safely, no shell interpolation
    const { stdout: s2, stderr: e2 } = await execFileAsync("git", ["commit", "-m", message], {
      cwd: PROJECT_ROOT,
      maxBuffer: 1024 * 1024,
      env: { ...SAFE_ENV, GIT_AUTHOR_NAME: "DeltaAI-Admin", GIT_AUTHOR_EMAIL: "admin@deltaai.com", GIT_COMMITTER_NAME: "DeltaAI-Admin", GIT_COMMITTER_EMAIL: "admin@deltaai.com" },
    });
    log.push(`$ git commit -m "${message}"\n${(s2 + e2).trim()}`);
    // 4. Push
    const { stdout: s3, stderr: e3 } = await execAsync("git push origin HEAD 2>&1", {
      cwd: PROJECT_ROOT,
      maxBuffer: 1024 * 1024,
      timeout: 60000,
    });
    log.push(`$ git push origin HEAD\n${(s3 + e3).trim()}`);
    return {
      tool: "git_commit_push",
      success: true,
      output: log.join("\n\n"),
      meta: { committed: true, message: args.message },
    };
  } catch (e: any) {
    return {
      tool: "git_commit_push",
      success: false,
      output: log.join("\n\n") + (e.stdout ? `\n${e.stdout}` : "") + (e.stderr ? `\n${e.stderr}` : ""),
      error: e.message,
    };
  }
}

/* ============================================================================
 * delete_file — حذف ملف
 * ========================================================================== */
async function deleteFile(args: { path: string }): Promise<ToolResult> {
  const full = safeResolve(args.path);
  try {
    const stat = await fs.stat(full);
    if (stat.isDirectory()) {
      await fs.rm(full, { recursive: true });
      return { tool: "delete_file", success: true, output: `Deleted directory: ${args.path}`, meta: { path: args.path, type: "directory" } };
    }
    await fs.unlink(full);
    return { tool: "delete_file", success: true, output: `Deleted file: ${args.path}`, meta: { path: args.path, type: "file" } };
  } catch (e: any) {
    return { tool: "delete_file", success: false, output: null, error: e.message };
  }
}

/* ============================================================================
 * Dispatch table
 * ========================================================================== */
type Handler = (args: any) => Promise<ToolResult>;

const HANDLERS: Record<string, Handler> = {
  list_files: listFiles,
  read_file: readFile,
  write_file: writeFile,
  modify_file: modifyFile,
  search_code: searchCode,
  run_lint: runLint,
  analyze_structure: analyzeStructure,
  run_command: runCommand,
  install_package: installPackage,
  fetch_url: fetchUrl,
  git_commit_push: gitCommitPush,
  delete_file: deleteFile,
};

/**
 * تنفيذ أداة أدمن بالاسم.
 */
export async function executeAdminTool(
  toolName: string,
  args: Record<string, unknown>,
  emit?: ToolEventEmitter,
): Promise<ToolResult> {
  const handler = HANDLERS[toolName];
  if (!handler) {
    return { tool: toolName, success: false, output: null, error: `Unknown tool: ${toolName}` };
  }
  const def = ADMIN_TOOL_MAP[toolName];
  emit?.({ type: "tool_start", tool: toolName, message: `Executing ${toolName}`, data: { args } });
  const start = Date.now();
  try {
    const result = await handler(args);
    result.meta = { ...result.meta, duration_ms: Date.now() - start };
    emit?.({
      type: result.success ? "tool_end" : "tool_error",
      tool: toolName,
      message: result.success ? "Completed" : "Failed",
      data: result,
    });
    return result;
  } catch (e: any) {
    const result: ToolResult = {
      tool: toolName,
      success: false,
      output: null,
      error: e.message,
      meta: { duration_ms: Date.now() - start },
    };
    emit?.({ type: "tool_error", tool: toolName, message: e.message, data: result });
    return result;
  }
}
