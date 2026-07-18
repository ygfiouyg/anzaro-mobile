/**
 * MCP Tool: Email Send via SMTP
 * تكامل حقيقي مع SMTP — إرسال إيميل حقيقي.
 * محتاج env vars: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 *
 * بيستخدم nodemailer (مثبت بالفعل في المشروع).
 */
import type { MCPTool } from "../types";

export const emailSmtpSendTool: MCPTool = {
  name: "email_smtp_send",
  description: "ابعت إيميل حقيقي عبر SMTP (Gmail, Outlook, إلخ). استخدمها لما المستخدم يقول 'ابعت إيميل' أو 'send email'.",
  parameters: {
    type: "object",
    properties: {
      to: { type: "string", description: "بريد المستلم (أو أكثر، مفصولة بفواصل)" },
      subject: { type: "string", description: "عنوان الإيميل" },
      body: { type: "string", description: "نص الإيميل" },
      html: { type: "boolean", description: "هل الـ body هو HTML؟ (افتراضي: false)", default: false },
    },
    required: ["to", "subject", "body"],
  },
  async execute(params) {
    const to = String(params.to || "").trim();
    const subject = String(params.subject || "").trim();
    const body = String(params.body || "");
    const isHtml = Boolean(params.html);

    if (!to || !subject || !body) {
      return { success: false, error: "to, subject, body كلهم مطلوبين" };
    }

    const host = process.env.SMTP_HOST;
    const port = process.env.SMTP_PORT;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.SMTP_FROM || user;

    if (!host || !user || !pass) {
      return {
        success: false,
        error: "SMTP env vars ناقصة. محتاج: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM",
      };
    }

    try {
      // استيراد ديناميكي عشان nodemailer يـ load بس لما يحتاجه
      const nodemailer = await import("nodemailer");

      const transporter = nodemailer.createTransport({
        host,
        port: Number(port) || 587,
        secure: (Number(port) || 587) === 465,
        auth: { user, pass },
      });

      const info = await transporter.sendMail({
        from,
        to,
        subject,
        ...(isHtml ? { html: body } : { text: body }),
      });

      return {
        success: true,
        data: {
          messageId: info.messageId,
          to,
          subject,
          from,
          sentAt: new Date().toISOString(),
          response: info.response,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
