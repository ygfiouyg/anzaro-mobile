/**
 * MCP Tool: Reddit Digest
 * فكرة من: Reddit AI digest
 */
import type { MCPTool } from "../types";

export const redditDigestTool: MCPTool = {
  name: "reddit_digest",
  description: "اجلب آخر بوستات من Reddit subreddit. استخدمها لما المستخدم يقول 'reddit' أو 'r/'.",
  parameters: {
    type: "object",
    properties: {
      subreddit: { type: "string", description: "اسم الـ subreddit (بدون r/)" },
      count: { type: "number", description: "عدد البوستات (افتراضي: 5)", default: 5 },
    },
    required: ["subreddit"],
  },
  async execute(params) {
    const subreddit = String(params.subreddit || "").replace("r/", "");
    const count = Number(params.count) || 5;
    if (!subreddit) return { success: false, error: "subreddit مطلوب" };
    try {
      const res = await fetch(`https://www.reddit.com/r/${subreddit}/hot.json?limit=${count}`, { headers: { "User-Agent": "DeltaAI/1.0" }, signal: AbortSignal.timeout(15000) });
      if (!res.ok) return { success: false, error: `Reddit API error: ${res.status}` };
      const data = await res.json();
      const posts = (data?.data?.children || []).map((p: any) => ({
        title: p?.data?.title || "", url: `https://reddit.com${p?.data?.permalink || ""}`, score: p?.data?.score || 0, author: p?.data?.author || "", comments: p?.data?.num_comments || 0,
      }));
      return { success: true, data: { subreddit, posts } };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
