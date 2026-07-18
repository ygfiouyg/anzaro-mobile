/**
 * MCP Tool: Unit Converter
 * تحويل بين وحدات القياس (محلي).
 * بيدعم: length, weight, temperature, volume, area, speed, time, data.
 */
import type { MCPTool } from "../types";

export const unitConverterTool: MCPTool = {
  name: "unit_converter",
  description: "تحويل بين وحدات القياس (محلي). استخدمها لما المستخدم يقول 'تحويل وحدات' أو 'convert units' أو 'كيلو'.",
  parameters: {
    type: "object",
    properties: {
      value: { type: "number", description: "القيمة" },
      from: { type: "string", description: "الوحدة المصدر (مثلاً: km, m, kg, celsius)" },
      to: { type: "string", description: "الوحدة الهدف (مثلاً: miles, feet, pounds, fahrenheit)" },
    },
    required: ["value", "from", "to"],
  },
  async execute(params) {
    const value = Number(params.value);
    const from = String(params.from || "").toLowerCase().trim();
    const to = String(params.to || "").toLowerCase().trim();

    if (isNaN(value)) return { success: false, error: "value لازم رقم" };
    if (!from || !to) return { success: false, error: "from و to مطلوبين" };

    try {
      const category = findCategory(from, to);
      if (!category) {
        return {
          success: false,
          error: `مفيش فئة تحويل بين "${from}" و "${to}". الفئات: length, weight, temperature, volume, area, speed, time, data`,
        };
      }

      let result: number;
      if (category === "temperature") {
        result = convertTemperature(value, from, to);
      } else {
        result = convertGeneric(value, from, to, category);
      }

      if (isNaN(result)) {
        return { success: false, error: `فشل التحويل من ${from} لـ ${to}` };
      }

      return {
        success: true,
        data: {
          value,
          from,
          to,
          category,
          result: Math.round(result * 1000000) / 1000000,
          formula: `${value} ${from} = ${Math.round(result * 1000000) / 1000000} ${to}`,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};

const CATEGORIES: Record<string, Record<string, number>> = {
  length: {
    mm: 0.001, cm: 0.01, m: 1, km: 1000,
    inch: 0.0254, feet: 0.3048, yard: 0.9144, mile: 1609.344,
    "nautical mile": 1852,
  },
  weight: {
    mg: 0.000001, g: 0.001, kg: 1, ton: 1000,
    ounce: 0.0283495, pound: 0.453592, "stone": 6.35029,
  },
  volume: {
    ml: 0.001, l: 1, "cubic meter": 1000,
    "teaspoon": 0.00492892, "tablespoon": 0.0147868,
    "fluid ounce": 0.0295735, cup: 0.236588,
    "pint": 0.473176, quart: 0.946353, gallon: 3.78541,
  },
  area: {
    "sq cm": 0.0001, "sq m": 1, "sq km": 1000000,
    "sq inch": 0.00064516, "sq feet": 0.092903, "sq yard": 0.836127,
    acre: 4046.86, hectare: 10000,
  },
  speed: {
    "m/s": 1, "km/h": 0.277778, "mph": 0.44704,
    "knot": 0.514444, "ft/s": 0.3048,
  },
  time: {
    ms: 0.001, s: 1, min: 60, h: 3600,
    day: 86400, week: 604800, "month": 2629746, year: 31556952,
  },
  data: {
    bit: 0.125, byte: 1, kb: 1024, mb: 1048576,
    gb: 1073741824, tb: 1099511627776,
  },
};

function findCategory(from: string, to: string): string | null {
  for (const [cat, units] of Object.entries(CATEGORIES)) {
    if (from in units && to in units) return cat;
  }
  // temperature special
  const tempUnits = ["c", "celsius", "f", "fahrenheit", "k", "kelvin"];
  if (tempUnits.includes(from) && tempUnits.includes(to)) return "temperature";
  return null;
}

function convertGeneric(value: number, from: string, to: string, category: string): number {
  const units = CATEGORIES[category];
  const fromFactor = units[from];
  const toFactor = units[to];
  if (!fromFactor || !toFactor) return NaN;
  // convert to base unit, then to target
  return (value * fromFactor) / toFactor;
}

function convertTemperature(value: number, from: string, to: string): number {
  // normalize
  const f = from.startsWith("c") ? "celsius" : from.startsWith("f") ? "fahrenheit" : "kelvin";
  const t = to.startsWith("c") ? "celsius" : to.startsWith("f") ? "fahrenheit" : "kelvin";

  // convert to celsius first
  let celsius: number;
  if (f === "celsius") celsius = value;
  else if (f === "fahrenheit") celsius = (value - 32) * 5 / 9;
  else celsius = value - 273.15;

  // convert from celsius to target
  if (t === "celsius") return celsius;
  if (t === "fahrenheit") return celsius * 9 / 5 + 32;
  return celsius + 273.15;
}
