/**
 * MCP Tool: Git Commit Message Generator
 * بيحلّل git diff وبيولّد commit message مناسب (محلي، بدون AI).
 * بيدعم Conventional Commits format.
 */
import type { MCPTool } from "../types";
import { execSync } from "child_process";

export const gitCommitTool: MCPTool = {
  name: "git_commit",
  description: "حلّل git diff وولّد commit message (محلي). استخدمها لما المستخدم يقول 'commit message' أو 'git commit'.",
  parameters: {
    type: "object",
    properties: {
      repoPath: { type: "string", description: "مسار الـ repo (افتراضي: cwd)" },
      format: {
        type: "string",
        description: "الصيغة: conventional (feat/fix/...), simple, detailed",
        default: "conventional",
      },
      scope: { type: "string", description: "scope محدد (اختياري)" },
    },
    required: [],
  },
  async execute(params) {
    const repoPath = String(params.repoPath || process.cwd()).trim();
    const format = String(params.format || "conventional").toLowerCase();
    const scope = String(params.scope || "").trim();

    try {
      // نجيب staged + unstaged diff
      const run = (cmd: string): string => {
        try {
          return execSync(cmd, {
            cwd: repoPath,
            encoding: "utf-8",
            timeout: 10000,
            stdio: ["pipe", "pipe", "pipe"],
          }).trim();
        } catch {
          return "";
        }
      };

      const isRepo = run("git rev-parse --is-inside-work-tree");
      if (isRepo !== "true") {
        return { success: false, error: `${repoPath} مش git repository` };
      }

      const stagedDiff = run("git diff --cached --stat");
      const unstagedDiff = run("git diff --stat");
      const status = run("git status --porcelain");
      const branch = run("git rev-parse --abbrev-ref HEAD");
      const recentCommits = run("git log --oneline -5");

      if (!status) {
        return {
          success: false,
          error: "مفيش تغييرات في الـ repo (working tree clean)",
        };
      }

      // حلّل الملفات المتغيرة
      const files = status
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const statusCode = line.slice(0, 2);
          const file = line.slice(3).trim();
          return { status: statusCode, file };
        });

      // حدد نوع التغيير
      const added = files.filter((f) => f.status.includes("A") || f.status === "??");
      const modified = files.filter((f) => f.status.includes("M"));
      const deleted = files.filter((f) => f.status.includes("D"));
      const renamed = files.filter((f) => f.status.includes("R"));

      // حدد الـ type للـ conventional commits
      let type = "chore";
      let scopeFromPath = "";

      // استنتج الـ type من أسماء الملفات
      const allFiles = files.map((f) => f.file);
      const hasFeature = allFiles.some((f) => /feature|feat|new/i.test(f));
      const hasFix = allFiles.some((f) => /fix|bug|hotfix/i.test(f));
      const hasDocs = allFiles.some((f) => /\.md$|docs?\//i.test(f));
      const hasTest = allFiles.some((f) => /test|spec/i.test(f));
      const hasStyle = allFiles.some((f) => /\.(css|scss|less)$/i.test(f));
      const hasRefactor = allFiles.some((f) => /refactor/i.test(f));
      const hasPerf = allFiles.some((f) => /perf|optim/i.test(f));

      if (hasFeature || added.length > modified.length) type = "feat";
      else if (hasFix) type = "fix";
      else if (hasDocs) type = "docs";
      else if (hasTest) type = "test";
      else if (hasStyle) type = "style";
      else if (hasRefactor) type = "refactor";
      else if (hasPerf) type = "perf";
      else if (deleted.length > 0) type = "chore";

      // استنتج الـ scope من أكبر مجلد مشترك
      const dirs = allFiles.map((f) => f.split("/")[0] || ".");
      const dirCounts: Record<string, number> = {};
      for (const d of dirs) dirCounts[d] = (dirCounts[d] || 0) + 1;
      scopeFromPath = Object.entries(dirCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "";

      const finalScope = scope || (scopeFromPath !== "." ? scopeFromPath : "");

      // ولّد الـ message
      let message: string;
      const fileCount = files.length;
      const summary = `${added.length} added, ${modified.length} modified, ${deleted.length} deleted`;

      if (format === "simple") {
        message = `${type}: ${summary} (${fileCount} files)`;
      } else if (format === "detailed") {
        const lines = [
          `${type}${finalScope ? `(${finalScope})` : ""}: ${summary}`,
          "",
          "Files changed:",
          ...allFiles.slice(0, 10).map((f) => `  - ${f}`),
          ...(fileCount > 10 ? [`  ... and ${fileCount - 10} more`] : []),
          "",
          `Branch: ${branch}`,
        ];
        message = lines.join("\n");
      } else {
        // conventional
        message = `${type}${finalScope ? `(${finalScope})` : ""}: ${summary}`;
      }

      return {
        success: true,
        data: {
          message,
          format,
          type,
          scope: finalScope,
          branch,
          files_changed: fileCount,
          summary: {
            added: added.length,
            modified: modified.length,
            deleted: deleted.length,
            renamed: renamed.length,
          },
          files: allFiles.slice(0, 20),
          staged: stagedDiff.slice(0, 500),
          unstaged: unstagedDiff.slice(0, 500),
          recent_commits: recentCommits,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
