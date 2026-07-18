/**
 * MCP Tool: Text Diff
 * بيحلّل الفروقات بين نصين ويرجّع unified diff.
 * محلي — بدون API خارجي.
 */
import type { MCPTool } from "../types";

export const textDiffTool: MCPTool = {
  name: "text_diff",
  description: "قارن بين نصين وأظهر الفروقات (محلي). استخدمها لما المستخدم يقول 'diff' أو 'قارن نصين' أو 'فروقات'.",
  parameters: {
    type: "object",
    properties: {
      text1: { type: "string", description: "النص الأول" },
      text2: { type: "string", description: "النص الثاني" },
      context: { type: "number", description: "أسطر سياق حول كل تغيير (افتراضي: 3)", default: 3 },
      ignoreWhitespace: { type: "boolean", description: "تجاهل المسافات الزائدة (افتراضي: false)", default: false },
    },
    required: ["text1", "text2"],
  },
  async execute(params) {
    let text1 = String(params.text1 || "");
    let text2 = String(params.text2 || "");
    const context = Math.min(10, Math.max(0, Number(params.context) || 3));
    const ignoreWhitespace = Boolean(params.ignoreWhitespace);

    if (!text1 && !text2) {
      return { success: false, error: "text1 و text2 مطلوبين" };
    }

    if (text1.length > 50000 || text2.length > 50000) {
      return { success: false, error: "النص طويل جداً (حد 50000 حرف)" };
    }

    try {
      if (ignoreWhitespace) {
        text1 = text1.replace(/[ \t]+/g, " ").replace(/\s+$/gm, "");
        text2 = text2.replace(/[ \t]+/g, " ").replace(/\s+$/gm, "");
      }

      const lines1 = text1.split("\n");
      const lines2 = text2.split("\n");

      // LCS-based diff
      const diff = computeDiff(lines1, lines2);

      // إحصائيات
      let added = 0;
      let removed = 0;
      let unchanged = 0;

      for (const d of diff) {
        if (d.type === "added") added++;
        else if (d.type === "removed") removed++;
        else unchanged++;
      }

      // unified diff format
      const unified = generateUnifiedDiff(diff, context);

      // similarity percentage
      const total = added + removed + unchanged;
      const similarity = total > 0 ? Math.round((unchanged / total) * 100) : 100;

      return {
        success: true,
        data: {
          text1_lines: lines1.length,
          text2_lines: lines2.length,
          added_lines: added,
          removed_lines: removed,
          unchanged_lines: unchanged,
          similarity_percent: similarity,
          identical: similarity === 100,
          unified_diff: unified,
          changes: diff
            .filter((d) => d.type !== "unchanged")
            .slice(0, 100)
            .map((d) => ({
              type: d.type,
              line: d.type === "added" ? d.line2 : d.line1,
              content: d.content.slice(0, 200),
            })),
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};

interface DiffEntry {
  type: "added" | "removed" | "unchanged";
  content: string;
  line1?: number;
  line2?: number;
}

function computeDiff(lines1: string[], lines2: string[]): DiffEntry[] {
  // LCS table
  const m = lines1.length;
  const n = lines2.length;
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (lines1[i - 1] === lines2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // backtrack
  const result: DiffEntry[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && lines1[i - 1] === lines2[j - 1]) {
      result.unshift({
        type: "unchanged",
        content: lines1[i - 1],
        line1: i,
        line2: j,
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({
        type: "added",
        content: lines2[j - 1],
        line2: j,
      });
      j--;
    } else if (i > 0) {
      result.unshift({
        type: "removed",
        content: lines1[i - 1],
        line1: i,
      });
      i--;
    }
  }

  return result;
}

function generateUnifiedDiff(diff: DiffEntry[], context: number): string {
  const lines: string[] = [];
  let line1 = 0;
  let line2 = 0;

  // find hunks (ranges of changes)
  const hunks: any[] = [];
  let currentHunk: any = null;

  for (let i = 0; i < diff.length; i++) {
    const d = diff[i];
    if (d.type === "unchanged") {
      if (currentHunk) {
        // check if we should close the hunk
        const contextEnd = currentHunk.start + currentHunk.lines.length;
        if (i - contextEnd >= context) {
          hunks.push(currentHunk);
          currentHunk = null;
        } else {
          currentHunk.lines.push(` ${d.content}`);
        }
      }
      if (d.line1) line1 = d.line1;
      if (d.line2) line2 = d.line2;
    } else {
      if (!currentHunk) {
        // start new hunk with context
        const startIdx = Math.max(0, i - context);
        currentHunk = {
          start: startIdx,
          line1Start: line1 + 1,
          line2Start: line2 + 1,
          lines: [] as string[],
        };
        // add context before
        for (let k = startIdx; k < i; k++) {
          if (diff[k].type === "unchanged") {
            currentHunk.lines.push(` ${diff[k].content}`);
          }
        }
      }
      if (d.type === "added") {
        currentHunk.lines.push(`+${d.content}`);
        if (d.line2) line2 = d.line2;
      } else {
        currentHunk.lines.push(`-${d.content}`);
        if (d.line1) line1 = d.line1;
      }
    }
  }
  if (currentHunk) hunks.push(currentHunk);

  // build unified diff
  for (const hunk of hunks) {
    const l1 = hunk.line1Start;
    const l2 = hunk.line2Start;
    const count1 = hunk.lines.filter((l: string) => l.startsWith(" ") || l.startsWith("-")).length;
    const count2 = hunk.lines.filter((l: string) => l.startsWith(" ") || l.startsWith("+")).length;
    lines.push(`@@ -${l1},${count1} +${l2},${count2} @@`);
    lines.push(...hunk.lines);
  }

  return lines.join("\n");
}
