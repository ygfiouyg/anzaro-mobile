/**
 * MCP Tool: Product Description
 * فكرة من: AI product imagines + Optimize Printify Title
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const productDescriptionTool: MCPTool = {
  name: "product_description",
  description: "اكتب وصف منتج احترافي. استخدمها لما المستخدم يقول 'وصف منتج' أو 'product description'.",
  parameters: {
    type: "object",
    properties: {
      product: { type: "string", description: "اسم/نوع المنتج" },
      features: { type: "string", description: "المميزات (اختياري)", default: "" },
    },
    required: ["product"],
  },
  async execute(params) {
    const product = String(params.product || "");
    const features = String(params.features || "");
    if (!product) return { success: false, error: "product مطلوب" };
    try {
      const systemMsg = `اكتب وصف منتج احترافي لـ: ${product}
${features ? "المميزات: " + features : ""}

اكتب:
1. عنوان جذاب
2. وصف قصير (50 كلمة)
3. وصف تفصيلي (200 كلمة)
4. 5 مزايا رئيسية
5. مواصفات تقنية مقترحة
6. SEO title + meta description

بالعربي.
رجّع JSON فقط:
{"title":"","short_description":"","long_description":"","key_features":[],"specifications":{},"seo_title":"","seo_meta_description":""}`;

      const result = await callGLMForJSON({
        systemPrompt: systemMsg,
        userMessage: product,
        maxTokens: 2000,
        temperature: 0.7,
      });
      if (result.success) {
        return { success: true, data: { product, ...result.data } };
      }
      return { success: false, error: result.error };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
