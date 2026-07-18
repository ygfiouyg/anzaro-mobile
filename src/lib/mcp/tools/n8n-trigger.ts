/**
 * MCP Tool — n8n Webhook Trigger
 * ==============================
 * إطلاق n8n workflow عبر POST لـ webhook URL.
 *
 * n8n بيوفر webhook triggers عامة URL ثابت لكل workflow — نتكلم معاه بـ JSON.
 */
import type { MCPTool } from "../types";

export const n8nTriggerTool: MCPTool = {
  name: "n8n_trigger",
  description:
    "Trigger an n8n workflow by POSTing a JSON payload to its webhook URL. The webhook URL is provided in the parameters (or via N8N_WEBHOOK_URL env var as default). Returns the workflow's response body.",
  parameters: {
    type: "object",
    properties: {
      webhookUrl: {
        type: "string",
        description:
          "The n8n webhook URL (e.g. 'https://n8n.example.com/webhook/abc-123'). If omitted, uses N8N_WEBHOOK_URL env var.",
      },
      method: {
        type: "string",
        description: "HTTP method.",
        enum: ["POST", "GET", "PUT"],
        default: "POST",
      },
      payload: {
        type: "string",
        description:
          "JSON-encoded payload to send. Pass a JSON object as a string (e.g. '{\"event\":\"new_user\",\"name\":\"Ahmed\"}').",
      },
      headers: {
        type: "string",
        description:
          "Optional: JSON-encoded additional headers (e.g. '{\"Authorization\":\"Bearer xxx\"}').",
      },
      timeoutMs: {
        type: "number",
        description: "Request timeout in milliseconds. Default 30000.",
        default: 30000,
      },
    },
    required: [],
  },
  async execute(params) {
    let webhookUrl = params.webhookUrl ? String(params.webhookUrl).trim() : "";
    if (!webhookUrl) {
      webhookUrl = process.env.N8N_WEBHOOK_URL || "";
    }
    if (!webhookUrl) {
      return {
        success: false,
        error: "webhookUrl مطلوبة (أو ضع N8N_WEBHOOK_URL env var)",
      };
    }
    if (!/^https?:\/\//i.test(webhookUrl)) {
      return { success: false, error: "webhookUrl لازم تبدأ بـ http:// أو https://" };
    }

    const method = (String(params.method || "POST").toUpperCase().trim()) as "POST" | "GET" | "PUT";
    const timeoutMs = Math.max(1000, Math.min(120_000, Number(params.timeoutMs) || 30_000));

    // Parse payload
    let payloadObj: unknown = {};
    if (params.payload) {
      try {
        payloadObj = JSON.parse(String(params.payload));
      } catch {
        return { success: false, error: "payload لازم يكون JSON صالح" };
      }
    }

    // Parse headers
    let extraHeaders: Record<string, string> = {};
    if (params.headers) {
      try {
        const parsed = JSON.parse(String(params.headers));
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          extraHeaders = parsed as Record<string, string>;
        } else {
          return { success: false, error: "headers لازم يكون JSON object صالح" };
        }
      } catch {
        return { success: false, error: "headers لازم يكون JSON object صالح" };
      }
    }

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...extraHeaders,
      };
      const init: RequestInit = {
        method,
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      };
      if (method !== "GET" && payloadObj) {
        init.body = JSON.stringify(payloadObj);
      }

      const res = await fetch(webhookUrl, init);
      const contentType = res.headers.get("content-type") || "";
      let body: unknown;
      if (contentType.includes("application/json")) {
        body = await res.json();
      } else {
        body = await res.text();
      }

      if (!res.ok) {
        return {
          success: false,
          error: `n8n webhook error HTTP ${res.status}`,
          data: { status: res.status, body, webhookUrl, method },
        };
      }

      return {
        success: true,
        data: {
          webhookUrl,
          method,
          statusCode: res.status,
          payload: payloadObj,
          response: body,
          triggeredAt: new Date().toISOString(),
        },
      };
    } catch (e: any) {
      return { success: false, error: `n8n trigger error: ${e.message}` };
    }
  },
};
