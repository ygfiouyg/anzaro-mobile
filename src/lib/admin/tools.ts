/**
 * Admin Tools Registry
 * ====================
 * الأدوات اللي بيستخدمها الـ Admin Agent للتحكم في المنصة:
 *   - قراءة وتعديل ملفات المشروع
 *   - بحث في الكود
 *   - تشغيل lint
 *   - تحليل هيكل المشروع
 *
 * كل أداة معرفة بـ JSON-Schema عشان GLM يعرف يستخدمها.
 */

export interface AdminTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

const t = (
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required?: string[],
): AdminTool => ({
  name,
  description,
  inputSchema: { type: "object", properties, required },
});

/**
 * قائمة الأدوات الكاملة (7 أدوات تحكم).
 */
export const ADMIN_TOOLS: AdminTool[] = [
  t(
    "list_files",
    "List files and directories in the project. Returns a tree of files with their sizes. Use this to explore the project structure before reading specific files.",
    {
      path: {
        type: "string",
        description: "Directory path relative to project root. Use '.' for root, 'src' for src folder, etc.",
      },
      maxDepth: {
        type: "number",
        description: "Maximum depth to traverse (default 3).",
      },
    },
  ),
  t(
    "read_file",
    "Read the complete contents of a file in the project. Use this to understand existing code, find bugs, or analyze logic before making changes.",
    {
      path: {
        type: "string",
        description: "File path relative to project root, e.g. 'src/app/page.tsx' or 'package.json'",
      },
    },
    ["path"],
  ),
  t(
    "write_file",
    "Create a new file or completely overwrite an existing file with the given content. Use this to add new features or replace broken code entirely.",
    {
      path: {
        type: "string",
        description: "File path relative to project root.",
      },
      content: {
        type: "string",
        description: "The complete new content of the file.",
      },
    },
    ["path", "content"],
  ),
  t(
    "modify_file",
    "Apply a targeted text replacement to an existing file. Finds the exact 'oldText' and replaces it with 'newText'. Safer than write_file for small edits. Use this for bug fixes and small modifications.",
    {
      path: {
        type: "string",
        description: "File path relative to project root.",
      },
      oldText: {
        type: "string",
        description: "The exact text to find (must match exactly, including whitespace and indentation).",
      },
      newText: {
        type: "string",
        description: "The replacement text.",
      },
    },
    ["path", "oldText", "newText"],
  ),
  t(
    "search_code",
    "Search for a pattern (regex supported) across all project files. Returns matching lines with file paths and line numbers. Use this to find usages, locate bugs, or understand how a function is used.",
    {
      pattern: {
        type: "string",
        description: "Text or regex pattern to search for.",
      },
      filePattern: {
        type: "string",
        description: "Glob pattern to filter files, e.g. '*.tsx' or '*.ts'. Default: all files.",
      },
    },
    ["pattern"],
  ),
  t(
    "run_lint",
    "Run ESLint on the project to check code quality. Returns lint errors and warnings. Use this after making changes to verify code quality.",
    {},
  ),
  t(
    "analyze_structure",
    "Analyze the overall project structure and return a summary: file counts by type, main directories, key configuration files, and dependencies. Use this at the start of a task to understand the project.",
    {},
  ),
  t(
    "run_command",
    "Run ANY shell command in the project directory with full power. This can install packages (bun add), run builds (bun run build), start services, run git commands, run scripts, compile code, etc. Returns stdout + stderr. Use this for anything that requires executing a system command. Timeout: 120 seconds.",
    {
      command: {
        type: "string",
        description: "The shell command to execute, e.g. 'bun add axios' or 'git clone https://github.com/user/repo' or 'bun run build'",
      },
      timeout_ms: {
        type: "number",
        description: "Timeout in milliseconds (default 120000 = 2 minutes, max 300000 = 5 minutes).",
      },
    },
    ["command"],
  ),
  t(
    "install_package",
    "Install an npm/bun package into the project. Updates package.json and installs the package. Supports any package name from the npm registry. Use this when the user wants to add a new library/tool to the project.",
    {
      package: {
        type: "string",
        description: "Package name (optionally with version), e.g. 'axios' or 'lodash@4.17.21' or 'typescript@latest'",
      },
      dev: {
        type: "boolean",
        description: "If true, install as devDependency. Default: false.",
      },
    },
    ["package"],
  ),
  t(
    "fetch_url",
    "Download content from any URL (GitHub raw files, APIs, npm packages, etc.). Returns the response body as text. Can fetch raw source code from GitHub, JSON from APIs, or any web content. Max size: 50MB.",
    {
      url: {
        type: "string",
        description: "The URL to fetch (http or https).",
      },
      save_to: {
        type: "string",
        description: "Optional: if provided, save the downloaded content to this file path (relative to project root). If not provided, returns content as text.",
      },
    },
    ["url"],
  ),
  t(
    "git_commit_push",
    "Stage all changes, commit them with a message, and push to the remote repository (origin/main). Use this to permanently save changes to the project on GitHub/HuggingFace. Requires git to be configured.",
    {
      message: {
        type: "string",
        description: "The commit message (in Arabic or English).",
      },
      add_all: {
        type: "boolean",
        description: "If true (default), stage all changes with 'git add -A'. If false, only committed files are pushed.",
      },
    },
    ["message"],
  ),
  t(
    "delete_file",
    "Delete a file from the project. Use with caution — this is irreversible. Use this to remove broken or unwanted files.",
    {
      path: {
        type: "string",
        description: "File path relative to project root.",
      },
    },
    ["path"],
  ),
];

/** Quick lookup map by tool name. */
export const ADMIN_TOOL_MAP: Record<string, AdminTool> = Object.fromEntries(
  ADMIN_TOOLS.map((tool) => [tool.name, tool]),
);
