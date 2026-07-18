/**
 * MCP Tool: Invoice Processor
 * سيناريو: استخرج بيانات فاتورة → حلل → تحقق
 * n8n template: "Invoice data extraction with LlamaParse and OpenAI"
 * 
 * الخطوات:
 * 1. استخرج البيانات المنظمة من نص الفاتورة
 * 2. تحقق من الأرقام (مجموع = مجموع الأصناف)
 * 3. صنّف + اكتشف مشاكل
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const invoiceProcessorTool: MCPTool = {
  name: "invoice_processor",
  description: "استخراج بيانات فاتورة + تحقق + تحليل (سيناريو متكامل). استخدمها لما المستخدم يقول 'حلل فاتورة' أو 'invoice' أو 'إيصال'.",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "نص الفاتورة/الإيصال" },
      currency: { type: "string", description: "العملة المتوقعة (اختياري: EGP, USD, EUR)", default: "" },
    },
    required: ["text"],
  },
  async execute(params) {
    const text = String(params.text || "").trim();
    const currency = String(params.currency || "").toUpperCase().trim();
    if (!text) return { success: false, error: "text مطلوب" };
    if (text.length > 15000) return { success: false, error: "النص طويل جداً (حد 15000 حرف)" };

    try {
      // ═══ 1) استخرج البيانات ═══
      const extraction = await callGLMForJSON({
        systemPrompt: `أنت نظام استخراج بيانات فواتير. استخرج كل البيانات من النص ده.
${currency ? `العملة المتوقعة: ${currency}` : ""}

رجّع JSON:
{
  "invoice_number": "",
  "date": "",
  "due_date": "",
  "seller": {"name":"","address":"","phone":"","tax_id":""},
  "buyer": {"name":"","address":""},
  "line_items": [{"description":"","quantity":0,"unit_price":0,"total":0}],
  "subtotal": 0,
  "tax": {"rate":0,"amount":0},
  "discount": 0,
  "grand_total": 0,
  "currency": "",
  "payment_method": "",
  "notes": ""
}`,
        userMessage: text.slice(0, 10000),
        maxTokens: 1500,
        temperature: 0.1,
      });

      const data = extraction.data || {};
      if (!data.invoice_number && !data.grand_total) {
        return { success: false, error: "تعذر استخراج بيانات الفاتورة — تأكد من النص" };
      }

      // ═══ 2) تحقق من الأرقام ═══
      const items = data.line_items || [];
      const calculatedSubtotal = items.reduce((s: number, item: any) => s + (item.total || item.quantity * item.unit_price || 0), 0);
      const calculatedTotal = calculatedSubtotal + (data.tax?.amount || 0) - (data.discount || 0);
      const discrepancy = Math.abs((data.grand_total || 0) - calculatedTotal);
      const hasDiscrepancy = discrepancy > 0.01;

      // ═══ 3) تحليل ═══
      const analysis = {
        items_count: items.length,
        calculated_subtotal: Math.round(calculatedSubtotal * 100) / 100,
        calculated_total: Math.round(calculatedTotal * 100) / 100,
        stated_total: data.grand_total || 0,
        discrepancy: Math.round(discrepancy * 100) / 100,
        has_discrepancy: hasDiscrepancy,
        tax_rate: data.tax?.rate || 0,
        tax_amount: data.tax?.amount || 0,
        has_discount: (data.discount || 0) > 0,
      };

      return {
        success: true,
        data: {
          scenario: "invoice_processor",
          steps: {
            extract: !!data.invoice_number || !!data.grand_total,
            verify: true,
            analyze: true,
          },
          invoice: data,
          verification: analysis,
          warnings: [
            ...(hasDiscrepancy ? [`⚠️ اختلاف في المجموع: المذكور ${data.grand_total}، المحسوب ${Math.round(calculatedTotal * 100) / 100}`] : []),
            ...(items.length === 0 ? ["⚠️ مفيش أصناف مستخرجة"] : []),
            ...(!data.date ? ["⚠️ التاريخ مش موجود"] : []),
          ],
        },
      };
    } catch (e: any) { return { success: false, error: e.message }; }
  },
};
