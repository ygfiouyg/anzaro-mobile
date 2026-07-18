/**
 * MCP Tool: Color Palette Generator
 * تكامل حقيقي مع Colormind API (مجاني تماماً) + fallback محلي.
 * بيولّد palettes متناسقة (model-based).
 */
import type { MCPTool } from "../types";

export const colorPaletteTool: MCPTool = {
  name: "color_palette",
  description: "ولّد color palettes متناسقة (API حقيقي). استخدمها لما المستخدم يقول 'ألوان' أو 'palette' أو 'color scheme'.",
  parameters: {
    type: "object",
    properties: {
      baseColor: {
        type: "string",
        description: "اللون الأساسي بصيغة hex (مثلاً: #3498db). اختياري — لو فاضي بيولّد عشوائي",
      },
      model: {
        type: "string",
        description: "النموذج: default, ui, vibrant, muted (افتراضي: default)",
        default: "default",
      },
      count: { type: "number", description: "عدد الألوان (افتراضي: 5)", default: 5 },
    },
    required: [],
  },
  async execute(params) {
    const baseColor = String(params.baseColor || "").trim();
    const model = String(params.model || "default").toLowerCase();
    const count = Math.min(10, Math.max(3, Number(params.count) || 5));

    try {
      // Colormind API — مجاني تماماً
      // ممكن تبعت base color ويرجّع palette متناسق
      const validModels = ["default", "ui", "vibrant", "muted"];
      const selectedModel = validModels.includes(model) ? model : "default";

      const body: any = { model: selectedModel };
      if (baseColor) {
        // حوّل hex لـ RGB array
        const hex = baseColor.replace("#", "");
        if (/^[0-9a-fA-F]{6}$/.test(hex)) {
          const r = parseInt(hex.slice(0, 2), 16);
          const g = parseInt(hex.slice(2, 4), 16);
          const b = parseInt(hex.slice(4, 6), 16);
          body.input = [[r, g, b], "N", "N", "N", "N"]; // base + 4 random
        }
      }

      const res = await fetch("http://colormind.io/api/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        // fallback: ولّد palette محلي
        return generateLocalPalette(baseColor, count, selectedModel);
      }

      const data: any = await res.json();
      const rgbPalette: number[][] = data.result || [];

      if (rgbPalette.length === 0) {
        return generateLocalPalette(baseColor, count, selectedModel);
      }

      const palette = rgbPalette.slice(0, count).map((rgb) => ({
        hex: rgbToHex(rgb[0], rgb[1], rgb[2]),
        rgb: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`,
        r: rgb[0],
        g: rgb[1],
        b: rgb[2],
      }));

      return {
        success: true,
        data: {
          model: selectedModel,
          base_color: baseColor || "(random)",
          palette,
          source: "colormind.io",
        },
      };
    } catch (e: any) {
      // fallback محلي
      return generateLocalPalette(baseColor, count, model);
    }
  },
};

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h /= 360;
  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
    g = Math.round(hue2rgb(p, q, h) * 255);
    b = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);
  }
  return [r, g, b];
}

function generateLocalPalette(baseColor: string, count: number, model: string): any {
  let baseHue = Math.floor(Math.random() * 360);
  if (baseColor) {
    const hex = baseColor.replace("#", "");
    if (/^[0-9a-fA-F]{6}$/.test(hex)) {
      const r = parseInt(hex.slice(0, 2), 16) / 255;
      const g = parseInt(hex.slice(2, 4), 16) / 255;
      const b = parseInt(hex.slice(4, 6), 16) / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const d = max - min;
      if (d !== 0) {
        if (max === r) baseHue = ((g - b) / d) % 6;
        else if (max === g) baseHue = (b - r) / d + 2;
        else baseHue = (r - g) / d + 4;
        baseHue = Math.round(baseHue * 60);
        if (baseHue < 0) baseHue += 360;
      }
    }
  }

  // نوع الـ palette: analogous, complementary, triadic
  const offset = model === "vibrant" ? 30 : model === "muted" ? 60 : 40;
  const saturation = model === "muted" ? 0.4 : 0.7;
  const palette: any[] = [];
  for (let i = 0; i < count; i++) {
    const h = (baseHue + i * offset) % 360;
    const s = saturation + (Math.random() * 0.2 - 0.1);
    const l = 0.4 + (i / count) * 0.4;
    const [r, g, b] = hslToRgb(h, s, l);
    palette.push({
      hex: rgbToHex(r, g, b),
      rgb: `rgb(${r}, ${g}, ${b})`,
      r, g, b,
    });
  }

  return {
    success: true,
    data: {
      model,
      base_color: baseColor || "(random)",
      palette,
      source: "local (HSL fallback)",
    },
  };
}
