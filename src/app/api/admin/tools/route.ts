/**
 * Tools Manager API
 * ================
 * إدارة الأدوات المثبتة في المنصة:
 *   GET    /api/admin/tools        — قائمة الأدوات المثبتة
 *   POST   /api/admin/tools        — تثبيت أداة جديدة (git clone, npm, pip, fetch)
 *   DELETE /api/admin/tools        — حذف أداة
 *   POST   /api/admin/tools/run    — تشغيل أداة بأمر معين
 *   GET    /api/admin/tools/list-dir — عرض محتويات مجلد أداة
 */

import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { withAuth, type AuthContext } from "@/lib/with-auth";

const execAsync = promisify(exec);
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const TOOLS_DIR = path.resolve(process.cwd(), "tools");

/** ضمان وجود مجلد tools */
async function ensureToolsDir() {
  try {
    await fs.mkdir(TOOLS_DIR, { recursive: true });
  } catch {}
}

/** قائمة الأدوات المثبتة */
async function listInstalledTools(): Promise<any[]> {
  await ensureToolsDir();
  try {
    const entries = await fs.readdir(TOOLS_DIR, { withFileTypes: true });
    const tools: any[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const toolPath = path.join(TOOLS_DIR, entry.name);
      const info: any = {
        name: entry.name,
        path: `tools/${entry.name}`,
        installedAt: null,
        type: "unknown",
        readme: false,
        size: 0,
      };
      try {
        const stat = await fs.stat(toolPath);
        info.installedAt = stat.birthtime.toISOString();
      } catch {}
      // detect type
      try {
        await fs.access(path.join(toolPath, "package.json"));
        info.type = "node";
      } catch {
        try {
          await fs.access(path.join(toolPath, "pyproject.toml"));
          info.type = "python";
        } catch {
          try {
            await fs.access(path.join(toolPath, "requirements.txt"));
            info.type = "python";
          } catch {
            try {
              await fs.access(path.join(toolPath, "setup.py"));
              info.type = "python";
            } catch {}
          }
        }
      }
      // check for README
      try {
        await fs.access(path.join(toolPath, "README.md"));
        info.readme = true;
      } catch {}
      // calculate size (du -sh style)
      try {
        const { stdout } = await execAsync(`du -sk ${toolPath}`);
        info.size = parseInt(stdout.split("\t")[0].trim(), 10); // KB
      } catch {}
      tools.push(info);
    }
    return tools;
  } catch {
    return [];
  }
}

/** كشف نوع الريpo من الـ URL */
function detectSourceType(url: string): { type: string; language: string } {
  const lower = url.toLowerCase();
  if (lower.includes("github.com") || lower.includes("gitlab.com") || lower.includes("bitbucket.org") || lower.endsWith(".git")) {
    return { type: "git", language: "unknown" };
  }
  if (lower.includes("pypi.org") || lower.includes("pip install")) {
    return { type: "pip", language: "python" };
  }
  if (lower.includes("npmjs.com") || lower.includes("npm install")) {
    return { type: "npm", language: "node" };
  }
  if (lower.startsWith("http") && (lower.endsWith(".py") || lower.endsWith(".js") || lower.endsWith(".ts"))) {
    return { type: "fetch", language: lower.endsWith(".py") ? "python" : "node" };
  }
  return { type: "fetch", language: "unknown" };
}

/** استخراج اسم الأداة من الـ URL */
function extractName(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    // github.com/user/repo → repo
    const last = parts[parts.length - 1] ?? "tool";
    return last.replace(/\.git$/, "").replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase();
  } catch {
    return `tool-${Date.now()}`;
  }
}

/** تثبيت أداة */
async function installTool(args: {
  url: string;
  name?: string;
  type?: string;
  installDeps?: boolean;
}): Promise<any> {
  await ensureToolsDir();
  const detected = detectSourceType(args.url);
  const type = args.type ?? detected.type;
  const name = (args.name ?? extractName(args.url)).slice(0, 50);
  const toolPath = path.join(TOOLS_DIR, name);
  const installDeps = args.installDeps !== false;
  const log: string[] = [];

  // Check if already exists
  try {
    await fs.access(toolPath);
    return { error: `أداة بنفس الاسم موجودة بالفعل: ${name}. استخدم اسم مختلف أو احذف القديم.` };
  } catch {}

  try {
    if (type === "git") {
      log.push(`$ git clone ${args.url} ${toolPath}`);
      const { stdout, stderr } = await execAsync(`git clone --depth 1 ${args.url} ${toolPath}`, {
        timeout: 120000,
        maxBuffer: 1024 * 1024 * 5,
      });
      log.push((stdout + stderr).trim() || "Cloned successfully");
    } else if (type === "pip") {
      // pip install to a venv inside the tool dir
      await fs.mkdir(toolPath, { recursive: true });
      log.push(`$ python3 -m venv ${toolPath}/.venv`);
      await execAsync(`python3 -m venv ${toolPath}/.venv`, { timeout: 60000 });
      const pkgName = extractName(args.url);
      log.push(`$ pip install ${pkgName}`);
      const { stdout, stderr } = await execAsync(`${toolPath}/.venv/bin/pip install ${pkgName}`, {
        timeout: 180000,
        maxBuffer: 1024 * 1024 * 5,
      });
      log.push((stdout + stderr).trim().slice(-2000));
      // Save metadata
      await fs.writeFile(
        path.join(toolPath, "tool-meta.json"),
        JSON.stringify({ name, type, source: args.url, installedAt: new Date().toISOString() }, null, 2),
      );
    } else if (type === "npm") {
      await fs.mkdir(toolPath, { recursive: true });
      const pkgName = extractName(args.url);
      log.push(`$ bun add ${pkgName}`);
      const { stdout, stderr } = await execAsync(`cd ${toolPath} && bun init -y && bun add ${pkgName}`, {
        timeout: 120000,
        maxBuffer: 1024 * 1024 * 5,
        shell: "/bin/bash",
      });
      log.push((stdout + stderr).trim().slice(-2000));
    } else {
      // fetch (single file)
      await fs.mkdir(toolPath, { recursive: true });
      const fileName = path.basename(new URL(args.url).pathname) || "file.txt";
      const filePath = path.join(toolPath, fileName);
      log.push(`$ curl -o ${filePath} ${args.url}`);
      const res = await fetch(args.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      await fs.writeFile(filePath, buf);
      log.push(`Downloaded ${buf.length} bytes to ${fileName}`);
    }

    // Auto-install dependencies if git
    if (type === "git" && installDeps) {
      // Node?
      try {
        await fs.access(path.join(toolPath, "package.json"));
        log.push("\n$ cd " + toolPath + " && bun install");
        try {
          const { stdout, stderr } = await execAsync(`cd ${toolPath} && bun install`, {
            timeout: 180000,
            maxBuffer: 1024 * 1024 * 5,
            shell: "/bin/bash",
          });
          log.push((stdout + stderr).trim().slice(-2000) || "Node deps installed");
        } catch (e: any) {
          log.push(`Node install failed: ${e.message}`);
        }
      } catch {}
      // Python?
      try {
        await fs.access(path.join(toolPath, "pyproject.toml"));
        log.push("\n$ cd " + toolPath + " && uv pip install -e .");
        try {
          // Create venv first
          await execAsync(`cd ${toolPath} && python3 -m venv .venv`, { timeout: 60000 });
          const { stdout, stderr } = await execAsync(`cd ${toolPath} && .venv/bin/pip install -e .`, {
            timeout: 300000,
            maxBuffer: 1024 * 1024 * 5,
            shell: "/bin/bash",
          });
          log.push((stdout + stderr).trim().slice(-2000) || "Python deps installed");
        } catch (e: any) {
          log.push(`Python install failed: ${e.message}`);
        }
      } catch {
        try {
          await fs.access(path.join(toolPath, "requirements.txt"));
          log.push("\n$ cd " + toolPath + " && pip install -r requirements.txt");
          await execAsync(`cd ${toolPath} && python3 -m venv .venv`, { timeout: 60000 });
          const { stdout, stderr } = await execAsync(`cd ${toolPath} && .venv/bin/pip install -r requirements.txt`, {
            timeout: 300000,
            maxBuffer: 1024 * 1024 * 5,
            shell: "/bin/bash",
          });
          log.push((stdout + stderr).trim().slice(-2000) || "Python deps installed");
        } catch (e: any) {
          log.push(`Python install failed: ${e.message}`);
        }
      }
    }

    // Save metadata
    await fs.writeFile(
      path.join(toolPath, ".tool-meta.json"),
      JSON.stringify({
        name,
        type,
        source: args.url,
        language: detected.language,
        installedAt: new Date().toISOString(),
      }, null, 2),
    );

    return {
      success: true,
      name,
      path: `tools/${name}`,
      type,
      language: detected.language,
      log: log.join("\n"),
    };
  } catch (e: any) {
    // cleanup partial install
    try {
      await fs.rm(toolPath, { recursive: true, force: true });
    } catch {}
    return { error: e.message, log: log.join("\n") };
  }
}

/** حذف أداة */
async function deleteTool(name: string): Promise<any> {
  const toolPath = path.join(TOOLS_DIR, path.basename(name));
  // safety: must be inside TOOLS_DIR
  if (!toolPath.startsWith(TOOLS_DIR)) {
    return { error: "Invalid tool path" };
  }
  try {
    await fs.rm(toolPath, { recursive: true, force: true });
    return { success: true, deleted: name };
  } catch (e: any) {
    return { error: e.message };
  }
}

/** تشغيل أمر داخل مجلد أداة */
async function runToolCommand(args: { name: string; command: string; timeout?: number }): Promise<any> {
  const toolPath = path.join(TOOLS_DIR, path.basename(args.name));
  if (!toolPath.startsWith(TOOLS_DIR)) {
    return { error: "Invalid tool path" };
  }
  try {
    const timeout = Math.min(args.timeout ?? 120000, 300000);
    // Use python venv if exists
    let cmd = args.command;
    if (await fs.access(path.join(toolPath, ".venv")).then(() => true).catch(() => false)) {
      // prepend venv activation for python tools
      if (cmd.startsWith("python") || cmd.startsWith("pip") || cmd.startsWith("pytest")) {
        cmd = cmd.replace("python", ".venv/bin/python").replace("pip", ".venv/bin/pip").replace("pytest", ".venv/bin/pytest");
      }
    }
    const { stdout, stderr } = await execAsync(cmd, {
      cwd: toolPath,
      timeout,
      maxBuffer: 1024 * 1024 * 5,
      env: { ...process.env },
      shell: "/bin/bash",
    });
    return {
      success: true,
      stdout: stdout.slice(0, 50000),
      stderr: stderr.slice(0, 20000),
      exitCode: 0,
    };
  } catch (e: any) {
    return {
      success: false,
      stdout: (e.stdout || "").slice(0, 50000),
      stderr: (e.stderr || "").slice(0, 20000),
      error: e.message,
      exitCode: e.code,
      timedOut: e.killed === true,
    };
  }
}

/** عرض محتويات مجلد أداة */
async function listToolDir(name: string, subPath?: string): Promise<any> {
  const toolPath = path.join(TOOLS_DIR, path.basename(name), subPath ?? "");
  if (!toolPath.startsWith(TOOLS_DIR)) {
    return { error: "Invalid path" };
  }
  try {
    const entries = await fs.readdir(toolPath, { withFileTypes: true });
    const items = [];
    for (const entry of entries) {
      if (entry.name.startsWith(".git") || entry.name === "node_modules" || entry.name === ".venv" || entry.name === "__pycache__") continue;
      let size = 0;
      try {
        if (entry.isFile()) {
          const stat = await fs.stat(path.join(toolPath, entry.name));
          size = stat.size;
        }
      } catch {}
      items.push({
        name: entry.name,
        type: entry.isDirectory() ? "directory" : "file",
        size,
        path: `${name}/${subPath ? subPath + "/" : ""}${entry.name}`,
      });
    }
    return { items, path: subPath ?? "" };
  } catch (e: any) {
    return { error: e.message };
  }
}

export const GET = withAuth(async (req: NextRequest, _ctx) => {
  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "list";
  const name = url.searchParams.get("name");
  const subPath = url.searchParams.get("path") ?? undefined;

  if (action === "list") {
    const tools = await listInstalledTools();
    return NextResponse.json({ tools });
  }
  if (action === "list-dir" && name) {
    const result = await listToolDir(name, subPath);
    return NextResponse.json(result);
  }
  if (action === "read" && name) {
    const filePath = path.join(TOOLS_DIR, path.basename(name));
    if (!filePath.startsWith(TOOLS_DIR)) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }
    try {
      const content = await fs.readFile(filePath, "utf-8");
      return NextResponse.json({ content, path: name });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
});

export const POST = withAuth(async (req: NextRequest, _ctx) => {
  try {
    const body = await req.json();
    const action = body.action ?? "install";

    if (action === "install") {
      const result = await installTool({
        url: body.url,
        name: body.name,
        type: body.type,
        installDeps: body.installDeps,
      });
      return NextResponse.json(result);
    }
    if (action === "delete") {
      const result = await deleteTool(body.name);
      return NextResponse.json(result);
    }
    if (action === "run") {
      const result = await runToolCommand({
        name: body.name,
        command: body.command,
        timeout: body.timeout,
      });
      return NextResponse.json(result);
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
});
