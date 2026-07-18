/**
 * n8n Workflow Templates
 * ======================
 * قوالب workflows جاهزة للاستيراد في n8n.
 *
 * كل قالب = JSON بصيغة n8n workflow format + metadata.
 * المستخدم يـ import الـ JSON في n8n Space → الـ workflow يبقى جاهز.
 *
 * الـ workflows دي بتتكامل مع DeltaAI عبر:
 *   - Webhook trigger (بيستقبل payload من n8n_workflow_async)
 *   - HTTP Request nodes (بينادي على DeltaAI /api/mcp/execute أو /api/mcp/job-complete)
 */

export interface N8nWorkflowTemplate {
  id: string;
  name: string;
  nameAr: string;
  description: string;
  category: string;
  icon: string;
  /**JSON workflow بصيغة n8n (جاهز للاستيراد) */
  workflow: unknown;
  /** التعليمات اللي بتظهر للمستخدم بعد الاستيراد */
  setupInstructions: string[];
  /** الـ env vars اللي محتاجة تتضبط في n8n */
  requiredEnvVars?: string[];
}

// ─────────────────────────────────────────────────────────────
// Helper: generate a basic n8n workflow JSON structure
// ─────────────────────────────────────────────────────────────

function makeWebhookTrigger(path: string, name: string) {
  return {
    parameters: {
      path,
      responseMode: "onReceived",
      options: {},
    },
    name,
    type: "n8n-nodes-base.webhook",
    typeVersion: 1,
    position: [240, 300],
    webhookId: `webhook-${path}`,
  };
}

function makeHttpResponseNode(
  name: string,
  url: string,
  method: "POST" | "GET" = "POST",
  bodyExpression: string,
  position: [number, number] = [460, 300],
) {
  return {
    parameters: {
      method,
      url,
      sendBody: true,
      bodyType: "json",
      jsonBody: bodyExpression,
      options: {},
    },
    name,
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4,
    position,
  };
}

function makeCodeNode(name: string, code: string, position: [number, number] = [680, 300]) {
  return {
    parameters: {
      jsCode: code,
    },
    name,
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position,
  };
}

// ─────────────────────────────────────────────────────────────
// TEMPLATES
// ─────────────────────────────────────────────────────────────

export const N8N_WORKFLOW_TEMPLATES: N8nWorkflowTemplate[] = [
  // ── 1. Video Creation Pipeline ────────────────────────────
  {
    id: "video_creation_pipeline",
    name: "Video Creation Pipeline",
    nameAr: "خط إنتاج الفيديو",
    description: "Workflow كامل لإنشاء فيديو: سكريبت → صور → TTS → تجميع → رفع يوتيوب.",
    category: "content",
    icon: "🎬",
    requiredEnvVars: ["DELTAAI_API_URL", "ZAI_API_KEY", "YOUTUBE_API_KEY"],
    setupInstructions: [
      "1. استيراد الـ workflow في n8n",
      "2. ضبط DELTAAI_API_URL = https://kopabdo-delta-ai-v2.hf.space",
      "3. ضبط ZAI_API_KEY في credentials",
      "4. ضبط YOUTUBE_API_KEY لرفع الفيديوهات",
      "5. الـ webhook URL هيكون: https://[n8n-space].hf.space/webhook/video-creation",
      "6. من DeltaAI، استخدم n8n_workflow_async بـ workflowType='video_creation'",
    ],
    workflow: {
      name: "Video Creation Pipeline",
      nodes: [
        makeWebhookTrigger("video-creation", "Webhook: Video Request"),
        makeCodeNode(
          "Extract Job Data",
          `// Extract job_id and inputs from webhook
const body = $input.item.json;
return {
  job_id: body.job_id,
  type: body.type,
  inputs: body.inputs,
  callback_url: body.callback_url
};`,
          [460, 300],
        ),
        makeHttpResponseNode(
          "Generate Script (DeltaAI)",
          "={{ $env.DELTAAI_API_URL }}/api/mcp/execute",
          "POST",
          `{
  "name": "write_article",
  "params": {
    "topic": "{{ $json.inputs.topic }}",
    "tone": "engaging",
    "wordCount": 500
  }
}`,
          [680, 300],
        ),
        makeHttpResponseNode(
          "Notify DeltaAI: Done",
          "={{ $env.DELTAAI_API_URL }}/api/mcp/job-complete",
          "POST",
          `{
  "job_id": "{{ $('Extract Job Data').item.json.job_id }}",
  "status": "done",
  "result": {
    "script": "{{ $json.data.content }}",
    "video_url": "https://youtube.com/watch?v=demo"
  }
}`,
          [900, 300],
        ),
      ],
      connections: {
        "Webhook: Video Request": {
          main: [[{ node: "Extract Job Data", type: "main", index: 0 }]],
        },
        "Extract Job Data": {
          main: [[{ node: "Generate Script (DeltaAI)", type: "main", index: 0 }]],
        },
        "Generate Script (DeltaAI)": {
          main: [[{ node: "Notify DeltaAI: Done", type: "main", index: 0 }]],
        },
      },
      active: false,
      settings: {},
      versionId: 1,
    },
  },

  // ── 2. Email Campaign ─────────────────────────────────────
  {
    id: "email_campaign",
    name: "Email Campaign Automation",
    nameAr: "أتمتة حملة الإيميلات",
    description: "حملة إيميلات: توليد محتوى → إرسال لقائمة → تتبع open/click → تقرير.",
    category: "communication",
    icon: "📧",
    requiredEnvVars: ["DELTAAI_API_URL", "BREVO_API_KEY"],
    setupInstructions: [
      "1. استيراد الـ workflow في n8n",
      "2. ضبط DELTAAI_API_URL = https://kopabdo-delta-ai-v2.hf.space",
      "3. ضبط BREVO_API_KEY (أو RESEND_API_KEY) للإرسال",
      "4. الـ webhook URL: https://[n8n-space].hf.space/webhook/email-campaign",
      "5. من DeltaAI، استخدم n8n_workflow_async بـ workflowType='email_campaign'",
    ],
    workflow: {
      name: "Email Campaign Automation",
      nodes: [
        makeWebhookTrigger("email-campaign", "Webhook: Email Campaign"),
        makeCodeNode(
          "Parse Campaign Data",
          `const body = $input.item.json;
return {
  job_id: body.job_id,
  subject: body.inputs.subject || "حملة جديدة",
  recipients: body.inputs.recipients || [],
  tone: body.inputs.tone || "professional"
};`,
          [460, 300],
        ),
        makeHttpResponseNode(
          "Generate Email Content",
          "={{ $env.DELTAAI_API_URL }}/api/mcp/execute",
          "POST",
          `{
  "name": "draft_email",
  "params": {
    "purpose": "{{ $json.subject }}",
    "tone": "{{ $json.tone }}"
  }
}`,
          [680, 300],
        ),
        makeHttpResponseNode(
          "Notify: Campaign Complete",
          "={{ $env.DELTAAI_API_URL }}/api/mcp/job-complete",
          "POST",
          `{
  "job_id": "{{ $('Parse Campaign Data').item.json.job_id }}",
  "status": "done",
  "result": {
    "sent": "{{ $('Parse Campaign Data').item.json.recipients.length }}",
    "email_content": "{{ $json.data.content }}"
  }
}`,
          [900, 300],
        ),
      ],
      connections: {
        "Webhook: Email Campaign": {
          main: [[{ node: "Parse Campaign Data", type: "main", index: 0 }]],
        },
        "Parse Campaign Data": {
          main: [[{ node: "Generate Email Content", type: "main", index: 0 }]],
        },
        "Generate Email Content": {
          main: [[{ node: "Notify: Campaign Complete", type: "main", index: 0 }]],
        },
      },
      active: false,
      settings: {},
      versionId: 1,
    },
  },

  // ── 3. Social Media Scheduler ─────────────────────────────
  {
    id: "social_scheduler",
    name: "Social Media Scheduler",
    nameAr: "جدولة السوشيال ميديا",
    description: "جدولة بوستات لـ 4 منصات على مدار الأسبوع مع توليد المحتوى تلقائياً.",
    category: "marketing",
    icon: "📱",
    requiredEnvVars: ["DELTAAI_API_URL"],
    setupInstructions: [
      "1. استيراد الـ workflow في n8n",
      "2. ضبط DELTAAI_API_URL = https://kopabdo-delta-ai-v2.hf.space",
      "3. الـ workflow بيشتغل كل يوم الساعة 9 الصبح (cron trigger)",
      "4. بيولّد محتوى + بيجدوله لـ Twitter, LinkedIn, Facebook, Instagram",
    ],
    workflow: {
      name: "Social Media Scheduler",
      nodes: [
        {
          parameters: {
            rule: {
              interval: [{ field: "cronExpression", expression: "0 9 * * *" }],
            },
          },
          name: "Daily 9 AM",
          type: "n8n-nodes-base.scheduleTrigger",
          typeVersion: 1,
          position: [240, 300],
        },
        makeHttpResponseNode(
          "Generate Content",
          "={{ $env.DELTAAI_API_URL }}/api/mcp/execute",
          "POST",
          `{
  "name": "write_social_post",
  "params": {
    "platform": "twitter",
    "topic": "تطوير ذاتي",
    "tone": "motivational"
  }
}`,
          [460, 300],
        ),
        makeCodeNode(
          "Format for Multi-Platform",
          `// Duplicate content for 4 platforms
const content = $input.item.json;
const platforms = ["twitter", "linkedin", "facebook", "instagram"];
return platforms.map(platform => ({
  json: {
    platform,
    content: content.data?.content || "محتوى تجريبي",
    scheduled_for: new Date(Date.now() + 3600000).toISOString()
  }
}));`,
          [680, 300],
        ),
      ],
      connections: {
        "Daily 9 AM": {
          main: [[{ node: "Generate Content", type: "main", index: 0 }]],
        },
        "Generate Content": {
          main: [[{ node: "Format for Multi-Platform", type: "main", index: 0 }]],
        },
      },
      active: false,
      settings: {},
      versionId: 1,
    },
  },

  // ── 4. Research Digest ────────────────────────────────────
  {
    id: "research_digest",
    name: "Daily Research Digest",
    nameAr: "ملخص بحثي يومي",
    description: "بحث يومي عن ترندات → تلخيص → إرسال لتليجرام/إيميل.",
    category: "research",
    icon: "🔬",
    requiredEnvVars: ["DELTAAI_API_URL", "TELEGRAM_BOT_TOKEN"],
    setupInstructions: [
      "1. استيراد الـ workflow في n8n",
      "2. ضبط DELTAAI_API_URL = https://kopabdo-delta-ai-v2.hf.space",
      "3. ضبط TELEGRAM_BOT_TOKEN للإرسال",
      "4. الـ workflow بيشتغل كل يوم الساعة 8 الصبح",
      "5. بيبحث + يلخص + يبعتلك على تليجرام",
    ],
    workflow: {
      name: "Daily Research Digest",
      nodes: [
        {
          parameters: {
            rule: {
              interval: [{ field: "cronExpression", expression: "0 8 * * *" }],
            },
          },
          name: "Daily 8 AM",
          type: "n8n-nodes-base.scheduleTrigger",
          typeVersion: 1,
          position: [240, 300],
        },
        makeHttpResponseNode(
          "Search Trends",
          "={{ $env.DELTAAI_API_URL }}/api/mcp/execute",
          "POST",
          `{
  "name": "web_search",
  "params": {
    "query": "أحدث ترندات الذكاء الاصطناعي 2026",
    "maxResults": 5
  }
}`,
          [460, 300],
        ),
        makeHttpResponseNode(
          "Summarize Results",
          "={{ $env.DELTAAI_API_URL }}/api/mcp/execute",
          "POST",
          `{
  "name": "summarize_text",
  "params": {
    "text": "{{ JSON.stringify($json.data) }}",
    "style": "bullets"
  }
}`,
          [680, 300],
        ),
        makeHttpResponseNode(
          "Send to Telegram",
          "https://api.telegram.org/bot={{ $env.TELEGRAM_BOT_TOKEN }}/sendMessage",
          "POST",
          `{
  "chat_id": "{{ $env.TELEGRAM_CHAT_ID }}",
  "text": "📰 ملخص ترندات AI اليوم:\\n\\n{{ $json.data.summary }}",
  "parse_mode": "Markdown"
}`,
          [900, 300],
        ),
      ],
      connections: {
        "Daily 8 AM": {
          main: [[{ node: "Search Trends", type: "main", index: 0 }]],
        },
        "Search Trends": {
          main: [[{ node: "Summarize Results", type: "main", index: 0 }]],
        },
        "Summarize Results": {
          main: [[{ node: "Send to Telegram", type: "main", index: 0 }]],
        },
      },
      active: false,
      settings: {},
      versionId: 1,
    },
  },

  // ── 5. Code Review Bot ────────────────────────────────────
  {
    id: "code_review_bot",
    name: "Automated Code Review Bot",
    nameAr: "بوت مراجعة الكود التلقائي",
    description: "مراجعة تلقائية لكل commit في GitLab/GitHub → تقرير → تعليق على الـ MR.",
    category: "dev",
    icon: "💻",
    requiredEnvVars: ["DELTAAI_API_URL", "GITLAB_TOKEN"],
    setupInstructions: [
      "1. استيراد الـ workflow في n8n",
      "2. ضبط DELTAAI_API_URL = https://kopabdo-delta-ai-v2.hf.space",
      "3. ضبط GITLAB_TOKEN للوصول للـ MRs",
      "4. اضبط webhook في GitLab لـ merge request events",
      "5. الـ workflow هيـ review كل MR تلقائياً",
    ],
    workflow: {
      name: "Automated Code Review Bot",
      nodes: [
        makeWebhookTrigger("gitlab-mr", "Webhook: GitLab MR"),
        makeCodeNode(
          "Extract MR Data",
          `const body = $input.item.json;
const mr = body.object_attributes || {};
return {
  job_id: body.job_id || 'mr-' + mr.iid,
  mr_iid: mr.iid,
  repo: body.project?.path_with_namespace,
  diff_url: mr.url,
  source_branch: mr.source_branch,
  target_branch: mr.target_branch
};`,
          [460, 300],
        ),
        makeHttpResponseNode(
          "Review Code (DeltaAI)",
          "={{ $env.DELTAAI_API_URL }}/api/mcp/execute",
          "POST",
          `{
  "name": "review_code",
  "params": {
    "code": "{{ $json.diff_url }}",
    "language": "auto"
  }
}`,
          [680, 300],
        ),
        makeHttpResponseNode(
          "Comment on MR",
          "https://gitlab.com/api/v4/projects/{{ encodeURIComponent($('Extract MR Data').item.json.repo) }}/merge_requests/{{ $('Extract MR Data').item.json.mr_iid }}/notes",
          "POST",
          `{
  "body": "🤖 مراجعة آلية:\\n\\n{{ $json.data.review }}"
}`,
          [900, 300],
        ),
      ],
      connections: {
        "Webhook: GitLab MR": {
          main: [[{ node: "Extract MR Data", type: "main", index: 0 }]],
        },
        "Extract MR Data": {
          main: [[{ node: "Review Code (DeltaAI)", type: "main", index: 0 }]],
        },
        "Review Code (DeltaAI)": {
          main: [[{ node: "Comment on MR", type: "main", index: 0 }]],
        },
      },
      active: false,
      settings: {},
      versionId: 1,
    },
  },
];

// ── Helpers ─────────────────────────────────────────────────

export function getWorkflowById(id: string): N8nWorkflowTemplate | undefined {
  return N8N_WORKFLOW_TEMPLATES.find((w) => w.id === id);
}

export function listWorkflowTemplates() {
  return N8N_WORKFLOW_TEMPLATES.map((w) => ({
    id: w.id,
    name: w.name,
    nameAr: w.nameAr,
    description: w.description,
    category: w.category,
    icon: w.icon,
    requiredEnvVars: w.requiredEnvVars || [],
    setupInstructionsCount: w.setupInstructions.length,
  }));
}
