/**
 * MCP Tool: Stock Analysis
 * سيناريو: اجمع بيانات سهم → حلل → تقرير استثماري
 * n8n template: "AI Crew to Automate Fundamental Stock Analysis - Q&A Workflow"
 * 
 * الخطوات:
 * 1. اجلب سعر السهم الحالي (stooq)
 * 2. اجلب معلومات الشركة (إذا متاحة)
 * 3. حلل بالـ AI → توصية
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

export const stockAnalysisTool: MCPTool = {
  name: "stock_analysis",
  description: "تحليل سهم شامل — سعر + تحليل + توصية استثمارية (سيناريو متكامل). استخدمها لما المستخدم يقول 'حلل سهم Apple' أو 'stock analysis'.",
  parameters: {
    type: "object",
    properties: {
      symbol: { type: "string", description: "رمز السهم (مثلاً: AAPL, MSFT, TSLA)" },
    },
    required: ["symbol"],
  },
  async execute(params) {
    const symbol = String(params.symbol || "").toUpperCase().trim();
    if (!symbol) return { success: false, error: "symbol مطلوب" };

    try {
      // ═══ 1) سعر السهم (stooq) ═══
      let stockData: any = null;
      try {
        const query = symbol.startsWith("^") ? symbol : `${symbol.toLowerCase()}.us`;
        const res = await fetch(`https://stooq.com/q/l/?s=${encodeURIComponent(query)}&f=sd2t2ohlcvn&h&e=csv`, {
          headers: { "User-Agent": "DeltaAI-MCP/1.0" },
          signal: AbortSignal.timeout(10000),
        });
        if (res.ok) {
          const csv = await res.text();
          const cols = csv.split("\n")[1]?.split(",") || [];
          if (cols.length >= 9) {
            const [sym, date, time, open, high, low, close, volume, name] = cols;
            if (close && close !== "N/A") {
              stockData = {
                symbol: sym || symbol,
                name: name || symbol,
                date, time,
                open: parseFloat(open) || 0,
                high: parseFloat(high) || 0,
                low: parseFloat(low) || 0,
                close: parseFloat(close) || 0,
                volume: parseInt(volume) || 0,
                change: parseFloat(close) - parseFloat(open),
                change_percent: parseFloat(open) > 0 ? ((parseFloat(close) - parseFloat(open)) / parseFloat(open)) * 100 : 0,
              };
            }
          }
        }
      } catch {}

      if (!stockData) {
        return { success: false, error: `تعذر الحصول على بيانات السهم "${symbol}"` };
      }

      // ═══ 2) تحليل بالـ AI ═══
      const analysis = await callGLMForJSON({
        systemPrompt: `أنت محلل مالي محترف. حلل السهم ده وأعطي تقرير استثماري.
بيانات السهم: ${JSON.stringify(stockData)}

رجّع JSON:
{
  "analysis": {
    "trend": "صاعد|هابط|ثابت",
    "volatility": "عالية|متوسطة|منخفضة",
    "volume_analysis": "تحليل حجم التداول"
  },
  "strengths": ["نقطة قوة 1", "نقطة قوة 2"],
  "risks": ["مخاطرة 1", "مخاطرة 2"],
  "recommendation": "buy|hold|sell|watch",
  "target_price": "سعر مستهدف تقريبي",
  "stop_loss": "سعر وقف الخسارة",
  "summary": "ملخص 2-3 أسطر",
  "disclaimer": "هذا ليس نصيحة مالية"
}`,
        userMessage: `${stockData.name} (${stockData.symbol}) - Close: $${stockData.close}`,
        maxTokens: 1000,
        temperature: 0.3,
      });

      const report = analysis.data || {};

      return {
        success: true,
        data: {
          scenario: "stock_analysis",
          symbol,
          stock_data: stockData,
          steps: {
            fetch_price: true,
            analyze: !!report.summary,
          },
          analysis: report.analysis || {},
          strengths: report.strengths || [],
          risks: report.risks || [],
          recommendation: report.recommendation || "watch",
          target_price: report.target_price || null,
          stop_loss: report.stop_loss || null,
          summary: report.summary || "",
          disclaimer: "⚠️ هذا تحليل آلي وليس نصيحة مالية. استشر مستشار مالي قبل الاستثمار.",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
