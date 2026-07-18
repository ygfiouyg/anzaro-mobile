/**
 * MCP Tool: Color Converter
 * تحويل بين أنظمة الألوان: HEX, RGB, HSL, HSV, CMYK.
 * محلي — بدون API خارجي.
 */
import type { MCPTool } from "../types";

export const colorConvertTool: MCPTool = {
  name: "color_convert",
  description: "تحويل بين HEX/RGB/HSL/HSV/CMYK (محلي). استخدمها لما المستخدم يقول 'لون' أو 'color convert' أو 'rgb' أو 'hex'.",
  parameters: {
    type: "object",
    properties: {
      color: { type: "string", description: "اللون بأي صيغة (مثلاً: #3498db, rgb(52,152,219), hsl(204,70%,53%))" },
    },
    required: ["color"],
  },
  async execute(params) {
    const colorStr = String(params.color || "").trim();
    if (!colorStr) return { success: false, error: "color مطلوب" };

    try {
      const rgb = parseColor(colorStr);
      if (!rgb) {
        return {
          success: false,
          error: "صيغة لون غير معروفة. جرّب: #3498db, rgb(52,152,219), hsl(204,70%,53%)",
        };
      }

      const [r, g, b] = rgb;
      const hex = rgbToHex(r, g, b);
      const hsl = rgbToHsl(r, g, b);
      const hsv = rgbToHsv(r, g, b);
      const cmyk = rgbToCmyk(r, g, b);
      const luminance = getLuminance(r, g, b);
      const isLight = luminance > 0.5;
      const contrastColor = isLight ? "#000000" : "#FFFFFF";

      // WCAG contrast ratios
      const contrastWhite = getContrastRatio(r, g, b, 255, 255, 255);
      const contrastBlack = getContrastRatio(r, g, b, 0, 0, 0);

      // complementary, analogous, triadic
      const complement = hslToRgb((hsl[0] + 180) % 360, hsl[1], hsl[2]);
      const analogous1 = hslToRgb((hsl[0] + 30) % 360, hsl[1], hsl[2]);
      const analogous2 = hslToRgb((hsl[0] + 330) % 360, hsl[1], hsl[2]);
      const triadic1 = hslToRgb((hsl[0] + 120) % 360, hsl[1], hsl[2]);
      const triadic2 = hslToRgb((hsl[0] + 240) % 360, hsl[1], hsl[2]);

      // color name (basic)
      const name = getColorName(r, g, b);

      return {
        success: true,
        data: {
          input: colorStr,
          name,
          hex: {
            hex,
            hex_no_hash: hex.slice(1),
            short: canShorten(hex) ? shortenHex(hex) : null,
          },
          rgb: {
            r, g, b,
            string: `rgb(${r}, ${g}, ${b})`,
            percentage: `rgb(${Math.round(r / 255 * 100)}%, ${Math.round(g / 255 * 100)}%, ${Math.round(b / 255 * 100)}%)`,
          },
          hsl: {
            h: hsl[0], s: hsl[1], l: hsl[2],
            string: `hsl(${hsl[0]}, ${hsl[1]}%, ${hsl[2]}%)`,
          },
          hsv: {
            h: hsv[0], s: hsv[1], v: hsv[2],
            string: `hsv(${hsv[0]}, ${hsv[1]}%, ${hsv[2]}%)`,
          },
          cmyk: {
            c: cmyk[0], m: cmyk[1], y: cmyk[2], k: cmyk[3],
            string: `cmyk(${cmyk[0]}%, ${cmyk[1]}%, ${cmyk[2]}%, ${cmyk[3]}%)`,
          },
          luminance: Math.round(luminance * 1000) / 1000,
          is_light: isLight,
          is_dark: !isLight,
          contrast_text: contrastColor,
          contrast_ratios: {
            white: Math.round(contrastWhite * 100) / 100,
            black: Math.round(contrastBlack * 100) / 100,
            wcag_aa_large: contrastWhite >= 3 || contrastBlack >= 3,
            wcag_aa_normal: contrastWhite >= 4.5 || contrastBlack >= 4.5,
            wcag_aaa: contrastWhite >= 7 || contrastBlack >= 7,
          },
          color_schemes: {
            complementary: rgbToHex(complement[0], complement[1], complement[2]),
            analogous: [
              rgbToHex(analogous1[0], analogous1[1], analogous1[2]),
              rgbToHex(analogous2[0], analogous2[1], analogous2[2]),
            ],
            triadic: [
              rgbToHex(triadic1[0], triadic1[1], triadic1[2]),
              rgbToHex(triadic2[0], triadic2[1], triadic2[2]),
            ],
          },
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};

function parseColor(str: string): [number, number, number] | null {
  // HEX: #rgb, #rrggbb
  const hexMatch = str.match(/^#?([a-f0-9]{3}|[a-f0-9]{6})$/i);
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3) {
      hex = hex.split("").map((c) => c + c).join("");
    }
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return [r, g, b];
  }

  // rgb(r, g, b) or rgb(r g b)
  const rgbMatch = str.match(/rgba?\(\s*(\d+)\s*[,\s]\s*(\d+)\s*[,\s]\s*(\d+)/i);
  if (rgbMatch) {
    return [parseInt(rgbMatch[1]), parseInt(rgbMatch[2]), parseInt(rgbMatch[3])];
  }

  // hsl(h, s%, l%)
  const hslMatch = str.match(/hsla?\(\s*(\d+)\s*[,\s]\s*(\d+)%\s*[,\s]\s*(\d+)%/i);
  if (hslMatch) {
    const h = parseInt(hslMatch[1]);
    const s = parseInt(hslMatch[2]);
    const l = parseInt(hslMatch[3]);
    return hslToRgb(h, s, l);
  }

  // named colors (basic)
  const namedColors: Record<string, [number, number, number]> = {
    red: [255, 0, 0], green: [0, 128, 0], blue: [0, 0, 255],
    white: [255, 255, 255], black: [0, 0, 0], yellow: [255, 255, 0],
    cyan: [0, 255, 255], magenta: [255, 0, 255], orange: [255, 165, 0],
    purple: [128, 0, 128], pink: [255, 192, 203], gray: [128, 128, 128],
    grey: [128, 128, 128], brown: [165, 42, 42], lime: [0, 255, 0],
    navy: [0, 0, 128], teal: [0, 128, 128], olive: [128, 128, 0],
    maroon: [128, 0, 0], silver: [192, 192, 192], gold: [255, 215, 0],
  };
  if (namedColors[str.toLowerCase()]) {
    return namedColors[str.toLowerCase()];
  }

  return null;
}

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((x) => Math.max(0, Math.min(255, x)).toString(16).padStart(2, "0")).join("");
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
    else if (max === g) h = ((b - r) / d + 2);
    else h = ((r - g) / d + 4);
    h *= 60;
  }

  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h /= 360; s /= 100; l /= 100;
  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;

  if (max !== min) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
    else if (max === g) h = ((b - r) / d + 2);
    else h = ((r - g) / d + 4);
    h *= 60;
  }

  return [Math.round(h), Math.round(s * 100), Math.round(v * 100)];
}

function rgbToCmyk(r: number, g: number, b: number): [number, number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const k = 1 - Math.max(r, g, b);
  if (k === 1) return [0, 0, 0, 100];
  const c = (1 - r - k) / (1 - k);
  const m = (1 - g - k) / (1 - k);
  const y = (1 - b - k) / (1 - k);
  return [Math.round(c * 100), Math.round(m * 100), Math.round(y * 100), Math.round(k * 100)];
}

function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function getContrastRatio(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  const l1 = getLuminance(r1, g1, b1);
  const l2 = getLuminance(r2, g2, b2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function canShorten(hex: string): boolean {
  const r = hex.slice(1, 3);
  const g = hex.slice(3, 5);
  const b = hex.slice(5, 7);
  return r[0] === r[1] && g[0] === g[1] && b[0] === b[1];
}

function shortenHex(hex: string): string {
  return "#" + hex[1] + hex[3] + hex[5];
}

function getColorName(r: number, g: number, b: number): string {
  const [h, s, l] = rgbToHsl(r, g, b);

  if (l < 10) return "أسود";
  if (l > 90) return "أبيض";
  if (s < 10) {
    if (l < 30) return "رمادي داكن";
    if (l < 70) return "رمادي";
    return "رمادي فاتح";
  }

  if (h < 15 || h >= 345) return "أحمر";
  if (h < 45) return "برتقالي";
  if (h < 70) return "أصفر";
  if (h < 165) return "أخضر";
  if (h < 200) return "تركواز";
  if (h < 255) return "أزرق";
  if (h < 290) return "بنفسجي";
  if (h < 345) return "وردي";
  return "أحمر";
}
