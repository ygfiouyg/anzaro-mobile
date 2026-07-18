/**
 * MCP Tool: Invoice / Receipt Parser
 * فكرة من: "Invoice data extraction" templates
 * بيستخرج بيانات منظّمة من نص فاتورة/إيصال.
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const invoiceParserTool: MCPTool = {
  name: "invoice_parser",
  description: "استخرج بيانات من فاتورة/إيصال نصي. استخدمها لما المستخدم يقول 'فاتورة' أو 'invoice' أو 'إيصال' أو 'استخرج بيانات'.",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "نص الفاتورة/الإيصال" },
      currency: { type: "string", description: "العملة المتوقعة (اختياري)" },
    },
    required: ["text"],
  },
  async execute(params) {
    const text = String(params.text || "");
    const currency = String(params.currency || "");
    if (!text) return { success: false, error: "text مطلوب" };
    if (text.length > 15000) return { success: false, error: "النص طويل جداً (حد 15000 حرف)" };
    try {
      const systemMsg = `أنت نظام استخراج بيانات فواتير. استخرج البيانات المنظّمة من نص الفاتورة/الإيصال ده:
"""
${text.slice(0, 10000)}
"""
${currency ? `العملة المتوقعة: ${currency}` : ""}

استخرج:
- رقم الفاتورة
- التاريخ
- بيانات البائع (الاسم، العنوان، رقم الهاتف لو موجود)
- بيانات المشتري (لو موجودة)
- قائمة الأصناف (الوصف، الكمية، سعر الوحدة، الإجمالي)
- المجموع الفرعي
- الضريبة (نسبة + قيمة)
- الخصم (لو موجود)
- المجموع النهائي
- طريقة الدفع (لو مذكورة)

رجّع JSON فقط:
{"invoice_number":"","date":"","seller":{"name":"","address":"","phone":"","tax_id":""},"buyer":{"name":"","address":""},"line_items":[{"description":"","quantity":0,"unit_price":0,"total":0}],"subtotal":0,"tax":{"rate":0,"amount":0},"discount":0,"grand_total":0,"payment_method":"","currency":"","notes":""}`;

      const result = await callGLMForJSON({
        systemPrompt: systemMsg,
        userMessage: text.slice(0, 500),
        maxTokens: 2000,
        temperature: 0.1,
      });
      if (result.success) {
        return { success: true, data: result.data };
      }
      return { success: false, error: result.error };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
