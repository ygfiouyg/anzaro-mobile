/**
 * MCP Tool: Budget Analyzer (Scenario)
 * سيناريو متعدد الخطوات: تحليل ميزانية + تصنيف + حساب savings rate + توصيات
 *
 * الخطوات:
 *  1) التحقق من المدخلات + استخراج رقم الدخل
 *  2) استخراج بنود المصاريف بأرقامها (regex)
 *  3) حساب المجموع الأولي + savings التقديري
 *  4) استدعاء GLM للتصنيف + التحليل + التوصيات
 *  5) التحقق من savings_rate + التحذيرات
 *  6) إرجاع النتيجة مع steps_completed
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";

function extractAmount(text: string): number {
  const m = text.replace(/[^\d.\-]/g, "").match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : 0;
}

export const budgetAnalyzerTool: MCPTool = {
  name: "budget_analyzer",
  description:
    "حلل الميزانية (دخل + مصاريف) + صنّفها + اقترح توفير. استخدمها لما المستخدم يقول 'حلل ميزانيتي' أو 'budget analysis' أو 'مصاريفي'.",
  parameters: {
    type: "object",
    properties: {
      income: { type: "string", description: "الدخل (مثال: 5000 USD أو 15000 جنيه)" },
      expenses: {
        type: "string",
        description: "المصاريف بأرقامها (مثال: إيجار 1500، طعام 600، مواصلات 300)",
      },
    },
    required: ["income", "expenses"],
  },
  async execute(params) {
    const incomeInput = String(params.income || "").trim();
    const expensesInput = String(params.expenses || "").trim();
    if (!incomeInput) return { success: false, error: "income مطلوب" };
    if (!expensesInput) return { success: false, error: "expenses مطلوبة" };

    const stepsCompleted: string[] = [];

    try {
      // ═══ Step 1: Validate + extract income ═══
      const income = extractAmount(incomeInput);
      if (income <= 0) return { success: false, error: "الدخل غير صالح" };
      stepsCompleted.push("extract_income");

      // ═══ Step 2: Extract expense items with amounts ═══
      const expenseLines = expensesInput
        .split(/[,،\n;]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      const expenseItems = expenseLines
        .map((line) => {
          const amount = extractAmount(line);
          const name = line.replace(/[\d.,]+/g, "").trim() || line;
          return { name, amount };
        })
        .filter((e) => e.amount > 0);

      const totalExpensesPre = expenseItems.reduce((s, e) => s + e.amount, 0);
      const savingsPre = income - totalExpensesPre;
      const savingsRatePre = income > 0 ? (savingsPre / income) * 100 : 0;
      stepsCompleted.push("parse_expenses");

      // ═══ Step 3: AI generation — categorize + analyze ═══
      const systemPrompt = `حلل الميزانية دي.
الدخل: ${income}.
المصاريف: ${expensesInput}.
رجّع JSON فقط:
{"categories":[{"name":"","amount":0,"percentage":0}],"total_expenses":0,"savings":0,"savings_rate":0,"recommendations":[],"warnings":[]}
- categories حسب النوع (سكن، طعام، نقل، ترفيه، فواتير، ادخار).
- recommendations 4 توصيات.
- warnings لو savings_rate < 10%.`;

      const result = await callGLMForJSON({
        systemPrompt,
        userMessage: `الدخل: ${income}. المصاريف: ${expensesInput}.`,
        maxTokens: 1500,
        temperature: 0.4,
      });

      if (!result.success) {
        return {
          success: false,
          error: result.error,
          data: { steps_completed: stepsCompleted },
        };
      }
      stepsCompleted.push("ai_analyze_budget");

      // ═══ Step 4: Validate + recompute percentages ═══
      const data = result.data || {};
      let categories = Array.isArray(data.categories) ? data.categories : [];

      // أعِد حساب النسب بناءً على المجموع الفعلي
      const aiTotal = Number(data.total_expenses) || totalExpensesPre;
      const baseTotal = aiTotal > 0 ? aiTotal : totalExpensesPre;

      categories = categories.map((c: any) => ({
        name: String(c.name || ""),
        amount: Number(c.amount) || 0,
        percentage: baseTotal > 0 ? Math.round(((Number(c.amount) || 0) / baseTotal) * 100) : 0,
      }));

      const finalTotal = categories.reduce((s: number, c: any) => s + c.amount, 0) || baseTotal;
      const finalSavings = income - finalTotal;
      const finalSavingsRate = income > 0 ? Math.round((finalSavings / income) * 100) : 0;

      // شيل warnings فاضية
      const warnings = Array.isArray(data.warnings)
        ? data.warnings.map((w: any) => String(w))
        : [];
      if (finalSavingsRate < 10) {
        warnings.push(`معدل الادخار منخفض (${finalSavingsRate}%) — أقل من 10% الموصى به.`);
      }
      if (finalSavingsRate < 0) {
        warnings.push(`المصاريف تتجاوز الدخل بمقدار ${Math.abs(finalSavings)} — عجز شهري.`);
      }

      const recommendations = Array.isArray(data.recommendations)
        ? data.recommendations.map((r: any) => String(r))
        : [];
      stepsCompleted.push("validate_compute");

      // ═══ Step 5: Return structured ═══
      return {
        success: true,
        data: {
          scenario: "budget_analyzer",
          income,
          income_raw: incomeInput,
          parsed_expenses: expenseItems,
          pre_analysis: {
            total_expenses: totalExpensesPre,
            savings: savingsPre,
            savings_rate: Math.round(savingsRatePre),
          },
          categories,
          total_expenses: finalTotal,
          savings: finalSavings,
          savings_rate: finalSavingsRate,
          recommendations,
          warnings,
          steps_completed: stepsCompleted,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
