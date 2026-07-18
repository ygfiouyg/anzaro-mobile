/**
 * Chart Generation Utility — SVG-based chart renderer for PDFs
 *
 * Generates clean SVG charts that can be embedded in PDFs via Playwright.
 * Supports bar, line, pie, radar chart types.
 * RTL-aware (Arabic labels, right-to-left layout).
 *
 * Task ID: arch-4
 */

import type { ChartSpec } from './design-reasoning';
import type { ThemePalette } from './dynamic-themes';

// ─── Default Palette (backward-compatible fallback) ────────────────────────

const DEFAULT_PALETTE: ThemePalette = {
  primary: '#1e293b',
  secondary: '#334155',
  accent: '#3182ce',
  accentWarm: '#dc2626',
  accentGreen: '#16a34a',
  bg: '#ffffff',
  surface: '#f8fafc',
  text: '#1e293b',
  textSecondary: '#475569',
  textMuted: '#94a3b8',
  border: '#e2e8f0',
  coverGradient: '',
  coverAccent: '#3182ce',
  coverAccent2: '#0d9488',
  coverAccent3: '#8b5cf6',
  coverDarkest: '#0f172a',
  coverBright: '#38bdf8',
  decoColors: ['#3182ce', '#0d9488', '#8b5cf6', '#f59e0b', '#ef4444'],
  sectionColors: [],
  accentInfo: '#6366f1',
  accentInfoBg: '#eef2ff',
  accentKey: '#dc2626',
  accentKeyBg: '#fef2f2',
  accentData: '#2563eb',
  accentDataBg: '#eff6ff',
  codeBackground: '#f1f5f9',
  tableStripe: '#f8fafc',
};

// ─── Color Helpers ────────────────────────────────────────────────────────

function hexToRGB(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16) || 0,
    parseInt(h.substring(2, 4), 16) || 0,
    parseInt(h.substring(4, 6), 16) || 0,
  ];
}

function hexWithOpacity(hex: string, opacity: number): string {
  const [r, g, b] = hexToRGB(hex);
  return `rgba(${r},${g},${b},${opacity})`;
}

// ─── SVG Chart Dimensions ─────────────────────────────────────────────────

const CHART_WIDTH_DEFAULT = 450;
const CHART_HEIGHT_DEFAULT = 280;
const PADDING_DEFAULT = 40;

// ─── Bar Chart ────────────────────────────────────────────────────────────

interface ChartDimensions {
  width: number;
  height: number;
  padding: number;
}

function generateBarChart(spec: ChartSpec, rtl: boolean, palette: ThemePalette, dims: ChartDimensions): string {
  const { data, colors, title } = spec;
  const labels = data.labels;
  const values = data.values;
  const maxVal = Math.max(...values, 1);
  const { width: CHART_WIDTH, height: CHART_HEIGHT, padding: PADDING } = dims;

  const chartAreaW = CHART_WIDTH - PADDING * 2;
  const chartAreaH = CHART_HEIGHT - PADDING * 2 - 30; // -30 for title
  const barCount = labels.length;
  const barW = Math.min(50, chartAreaW / (barCount * 1.5));
  const gap = (chartAreaW - barW * barCount) / (barCount + 1);

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CHART_WIDTH}" height="${CHART_HEIGHT}" viewBox="0 0 ${CHART_WIDTH} ${CHART_HEIGHT}">`;

  // Background
  svg += `<rect width="${CHART_WIDTH}" height="${CHART_HEIGHT}" fill="${palette.bg}" rx="8"/>`;

  // Title
  svg += `<text x="${CHART_WIDTH / 2}" y="24" text-anchor="middle" font-family="Cairo, sans-serif" font-size="14" font-weight="bold" fill="${palette.text}">${escapeXml(title)}</text>`;

  // Grid lines
  for (let i = 0; i <= 4; i++) {
    const y = PADDING + 30 + (chartAreaH / 4) * i;
    const val = Math.round(maxVal * (1 - i / 4));
    svg += `<line x1="${PADDING}" y1="${y}" x2="${CHART_WIDTH - PADDING}" y2="${y}" stroke="${palette.border}" stroke-width="0.5"/>`;
    svg += `<text x="${rtl ? CHART_WIDTH - PADDING + 5 : PADDING - 5}" y="${y + 4}" text-anchor="${rtl ? 'start' : 'end'}" font-family="Cairo, sans-serif" font-size="9" fill="${palette.textMuted}">${val}</text>`;
  }

  // Bars
  for (let i = 0; i < barCount; i++) {
    const barH = (values[i] / maxVal) * chartAreaH;
    const x = PADDING + gap + i * (barW + gap);
    const y = PADDING + 30 + chartAreaH - barH;
    const color = colors[i % colors.length] || palette.accent;

    // Bar with rounded top
    svg += `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" fill="${color}" rx="3"/>`;

    // Value on top of bar
    svg += `<text x="${x + barW / 2}" y="${y - 5}" text-anchor="middle" font-family="Cairo, sans-serif" font-size="9" font-weight="bold" fill="${palette.text}">${values[i]}</text>`;

    // Label below bar
    const labelX = x + barW / 2;
    const labelY = PADDING + 30 + chartAreaH + 14;
    svg += `<text x="${labelX}" y="${labelY}" text-anchor="middle" font-family="Cairo, sans-serif" font-size="8" fill="${palette.textMuted}">${escapeXml(labels[i].substring(0, 12))}</text>`;
  }

  svg += `</svg>`;
  return svg;
}

// ─── Line Chart ───────────────────────────────────────────────────────────

function generateLineChart(spec: ChartSpec, rtl: boolean, palette: ThemePalette, dims: ChartDimensions): string {
  const { data, colors, title } = spec;
  const labels = data.labels;
  const values = data.values;
  const maxVal = Math.max(...values, 1);
  const { width: CHART_WIDTH, height: CHART_HEIGHT, padding: PADDING } = dims;

  const chartAreaW = CHART_WIDTH - PADDING * 2;
  const chartAreaH = CHART_HEIGHT - PADDING * 2 - 30;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CHART_WIDTH}" height="${CHART_HEIGHT}" viewBox="0 0 ${CHART_WIDTH} ${CHART_HEIGHT}">`;

  // Background
  svg += `<rect width="${CHART_WIDTH}" height="${CHART_HEIGHT}" fill="${palette.bg}" rx="8"/>`;

  // Title
  svg += `<text x="${CHART_WIDTH / 2}" y="24" text-anchor="middle" font-family="Cairo, sans-serif" font-size="14" font-weight="bold" fill="${palette.text}">${escapeXml(title)}</text>`;

  // Grid lines
  for (let i = 0; i <= 4; i++) {
    const y = PADDING + 30 + (chartAreaH / 4) * i;
    const val = Math.round(maxVal * (1 - i / 4));
    svg += `<line x1="${PADDING}" y1="${y}" x2="${CHART_WIDTH - PADDING}" y2="${y}" stroke="${palette.border}" stroke-width="0.5"/>`;
    svg += `<text x="${rtl ? CHART_WIDTH - PADDING + 5 : PADDING - 5}" y="${y + 4}" text-anchor="${rtl ? 'start' : 'end'}" font-family="Cairo, sans-serif" font-size="9" fill="${palette.textMuted}">${val}</text>`;
  }

  // Calculate points
  const points: string[] = [];
  const stepX = chartAreaW / Math.max(labels.length - 1, 1);

  for (let i = 0; i < labels.length; i++) {
    const x = PADDING + i * stepX;
    const y = PADDING + 30 + chartAreaH - (values[i] / maxVal) * chartAreaH;
    points.push(`${x},${y}`);
  }

  // Area fill
  const firstX = PADDING;
  const lastX = PADDING + (labels.length - 1) * stepX;
  const baseY = PADDING + 30 + chartAreaH;
  const areaPoints = `${firstX},${baseY} ${points.join(' ')} ${lastX},${baseY}`;
  const mainColor = colors[0] || palette.accent;

  svg += `<polygon points="${areaPoints}" fill="${hexWithOpacity(mainColor, 0.15)}"/>`;

  // Line
  svg += `<polyline points="${points.join(' ')}" fill="none" stroke="${mainColor}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;

  // Dots and labels
  for (let i = 0; i < labels.length; i++) {
    const x = PADDING + i * stepX;
    const y = PADDING + 30 + chartAreaH - (values[i] / maxVal) * chartAreaH;

    // Dot
    svg += `<circle cx="${x}" cy="${y}" r="4" fill="${palette.bg}" stroke="${mainColor}" stroke-width="2"/>`;

    // Value above dot
    svg += `<text x="${x}" y="${y - 10}" text-anchor="middle" font-family="Cairo, sans-serif" font-size="9" font-weight="bold" fill="${palette.text}">${values[i]}</text>`;

    // Label below
    svg += `<text x="${x}" y="${baseY + 14}" text-anchor="middle" font-family="Cairo, sans-serif" font-size="8" fill="${palette.textMuted}">${escapeXml(labels[i].substring(0, 12))}</text>`;
  }

  svg += `</svg>`;
  return svg;
}

// ─── Pie Chart ────────────────────────────────────────────────────────────

function generatePieChart(spec: ChartSpec, rtl: boolean, palette: ThemePalette, dims: ChartDimensions): string {
  const { data, colors, title } = spec;
  const labels = data.labels;
  const values = data.values;
  const total = values.reduce((a, b) => a + b, 0) || 1;
  const { width: CHART_WIDTH, height: CHART_HEIGHT } = dims;

  const centerX = CHART_WIDTH / 2;
  const centerY = CHART_HEIGHT / 2 + 10;
  const radius = 90;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CHART_WIDTH}" height="${CHART_HEIGHT}" viewBox="0 0 ${CHART_WIDTH} ${CHART_HEIGHT}">`;

  // Background
  svg += `<rect width="${CHART_WIDTH}" height="${CHART_HEIGHT}" fill="${palette.bg}" rx="8"/>`;

  // Title
  svg += `<text x="${CHART_WIDTH / 2}" y="24" text-anchor="middle" font-family="Cairo, sans-serif" font-size="14" font-weight="bold" fill="${palette.text}">${escapeXml(title)}</text>`;

  // Draw pie slices
  let startAngle = -Math.PI / 2; // Start from top

  for (let i = 0; i < labels.length; i++) {
    const sliceAngle = (values[i] / total) * 2 * Math.PI;
    const endAngle = startAngle + sliceAngle;
    const color = colors[i % colors.length] || palette.accent;

    // Calculate arc path
    const x1 = centerX + radius * Math.cos(startAngle);
    const y1 = centerY + radius * Math.sin(startAngle);
    const x2 = centerX + radius * Math.cos(endAngle);
    const y2 = centerY + radius * Math.sin(endAngle);
    const largeArc = sliceAngle > Math.PI ? 1 : 0;

    svg += `<path d="M ${centerX} ${centerY} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z" fill="${color}" stroke="${palette.bg}" stroke-width="2"/>`;

    // Label on slice
    const midAngle = startAngle + sliceAngle / 2;
    const labelRadius = radius * 0.65;
    const labelX = centerX + labelRadius * Math.cos(midAngle);
    const labelY = centerY + labelRadius * Math.sin(midAngle);
    const percentage = Math.round((values[i] / total) * 100);

    if (percentage > 5) {
      svg += `<text x="${labelX}" y="${labelY}" text-anchor="middle" dominant-baseline="central" font-family="Cairo, sans-serif" font-size="10" font-weight="bold" fill="${palette.bg}">${percentage}%</text>`;
    }

    startAngle = endAngle;
  }

  // Legend
  const legendStartY = CHART_HEIGHT - 30;
  const legendItemWidth = CHART_WIDTH / Math.min(labels.length, 4);
  for (let i = 0; i < Math.min(labels.length, 4); i++) {
    const lx = 10 + (i % 4) * legendItemWidth;
    const ly = legendStartY + Math.floor(i / 4) * 16;
    const color = colors[i % colors.length] || palette.accent;

    svg += `<rect x="${lx}" y="${ly}" width="10" height="10" fill="${color}" rx="2"/>`;
    svg += `<text x="${lx + 14}" y="${ly + 9}" font-family="Cairo, sans-serif" font-size="8" fill="${palette.textMuted}">${escapeXml(labels[i].substring(0, 10))}</text>`;
  }

  svg += `</svg>`;
  return svg;
}

// ─── Radar Chart ──────────────────────────────────────────────────────────

function generateRadarChart(spec: ChartSpec, rtl: boolean, palette: ThemePalette, dims: ChartDimensions): string {
  const { data, colors, title } = spec;
  const labels = data.labels;
  const values = data.values;
  const maxVal = Math.max(...values, 1);
  const { width: CHART_WIDTH, height: CHART_HEIGHT } = dims;

  const centerX = CHART_WIDTH / 2;
  const centerY = CHART_HEIGHT / 2 + 10;
  const radius = 90;
  const sides = Math.max(labels.length, 3);

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CHART_WIDTH}" height="${CHART_HEIGHT}" viewBox="0 0 ${CHART_WIDTH} ${CHART_HEIGHT}">`;

  // Background
  svg += `<rect width="${CHART_WIDTH}" height="${CHART_HEIGHT}" fill="${palette.bg}" rx="8"/>`;

  // Title
  svg += `<text x="${CHART_WIDTH / 2}" y="24" text-anchor="middle" font-family="Cairo, sans-serif" font-size="14" font-weight="bold" fill="${palette.text}">${escapeXml(title)}</text>`;

  // Grid rings
  for (let ring = 1; ring <= 4; ring++) {
    const r = (radius / 4) * ring;
    let ringPoints = '';
    for (let i = 0; i < sides; i++) {
      const angle = (2 * Math.PI * i) / sides - Math.PI / 2;
      const x = centerX + r * Math.cos(angle);
      const y = centerY + r * Math.sin(angle);
      ringPoints += `${x},${y} `;
    }
    svg += `<polygon points="${ringPoints.trim()}" fill="none" stroke="${palette.border}" stroke-width="0.5"/>`;
  }

  // Axis lines
  for (let i = 0; i < sides; i++) {
    const angle = (2 * Math.PI * i) / sides - Math.PI / 2;
    const x = centerX + radius * Math.cos(angle);
    const y = centerY + radius * Math.sin(angle);
    svg += `<line x1="${centerX}" y1="${centerY}" x2="${x}" y2="${y}" stroke="${palette.border}" stroke-width="0.5"/>`;
  }

  // Data polygon
  const mainColor = colors[0] || palette.accent;
  let dataPoints = '';
  const dataPointsArr: { x: number; y: number }[] = [];

  for (let i = 0; i < sides; i++) {
    const angle = (2 * Math.PI * i) / sides - Math.PI / 2;
    const r = (values[i] / maxVal) * radius;
    const x = centerX + r * Math.cos(angle);
    const y = centerY + r * Math.sin(angle);
    dataPoints += `${x},${y} `;
    dataPointsArr.push({ x, y });
  }

  svg += `<polygon points="${dataPoints.trim()}" fill="${hexWithOpacity(mainColor, 0.2)}" stroke="${mainColor}" stroke-width="2"/>`;

  // Data points and labels
  for (let i = 0; i < sides; i++) {
    const angle = (2 * Math.PI * i) / sides - Math.PI / 2;
    const labelR = radius + 18;
    const lx = centerX + labelR * Math.cos(angle);
    const ly = centerY + labelR * Math.sin(angle);

    // Dot
    svg += `<circle cx="${dataPointsArr[i].x}" cy="${dataPointsArr[i].y}" r="3" fill="${mainColor}"/>`;

    // Label
    svg += `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="central" font-family="Cairo, sans-serif" font-size="8" fill="${palette.textMuted}">${escapeXml(labels[i].substring(0, 10))}</text>`;
  }

  svg += `</svg>`;
  return svg;
}

// ─── Scatter Chart ────────────────────────────────────────────────────────

function generateScatterChart(spec: ChartSpec, rtl: boolean, palette: ThemePalette, dims: ChartDimensions): string {
  // For scatter, we treat labels as x-coordinates if numeric, otherwise use index
  const { data, colors, title } = spec;
  const labels = data.labels;
  const values = data.values;
  const { width: CHART_WIDTH, height: CHART_HEIGHT, padding: PADDING } = dims;

  const chartAreaW = CHART_WIDTH - PADDING * 2;
  const chartAreaH = CHART_HEIGHT - PADDING * 2 - 30;
  const maxVal = Math.max(...values, 1);

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CHART_WIDTH}" height="${CHART_HEIGHT}" viewBox="0 0 ${CHART_WIDTH} ${CHART_HEIGHT}">`;

  // Background
  svg += `<rect width="${CHART_WIDTH}" height="${CHART_HEIGHT}" fill="${palette.bg}" rx="8"/>`;

  // Title
  svg += `<text x="${CHART_WIDTH / 2}" y="24" text-anchor="middle" font-family="Cairo, sans-serif" font-size="14" font-weight="bold" fill="${palette.text}">${escapeXml(title)}</text>`;

  // Grid
  for (let i = 0; i <= 4; i++) {
    const y = PADDING + 30 + (chartAreaH / 4) * i;
    svg += `<line x1="${PADDING}" y1="${y}" x2="${CHART_WIDTH - PADDING}" y2="${y}" stroke="${palette.border}" stroke-width="0.5"/>`;
  }

  // Data points
  const stepX = chartAreaW / Math.max(labels.length - 1, 1);
  const mainColor = colors[0] || palette.accent;

  for (let i = 0; i < labels.length; i++) {
    const x = PADDING + i * stepX;
    const y = PADDING + 30 + chartAreaH - (values[i] / maxVal) * chartAreaH;
    const color = colors[i % colors.length] || mainColor;

    svg += `<circle cx="${x}" cy="${y}" r="5" fill="${color}" opacity="0.8"/>`;

    // Value label
    svg += `<text x="${x}" y="${y - 10}" text-anchor="middle" font-family="Cairo, sans-serif" font-size="8" fill="${palette.textMuted}">${values[i]}</text>`;

    // X label
    const baseY = PADDING + 30 + chartAreaH;
    svg += `<text x="${x}" y="${baseY + 14}" text-anchor="middle" font-family="Cairo, sans-serif" font-size="8" fill="${palette.textMuted}">${escapeXml(labels[i].substring(0, 10))}</text>`;
  }

  svg += `</svg>`;
  return svg;
}

// ─── Main Export ──────────────────────────────────────────────────────────

/**
 * Generate an SVG chart from a ChartSpec
 */
export function generateChartSVG(spec: ChartSpec, rtl: boolean = true, palette?: ThemePalette): string {
  const p = palette || DEFAULT_PALETTE;
  const dims: ChartDimensions = {
    width: CHART_WIDTH_DEFAULT,
    height: CHART_HEIGHT_DEFAULT,
    padding: PADDING_DEFAULT,
  };
  switch (spec.type) {
    case 'bar':
      return generateBarChart(spec, rtl, p, dims);
    case 'line':
      return generateLineChart(spec, rtl, p, dims);
    case 'pie':
      return generatePieChart(spec, rtl, p, dims);
    case 'radar':
      return generateRadarChart(spec, rtl, p, dims);
    case 'scatter':
      return generateScatterChart(spec, rtl, p, dims);
    default:
      return generateBarChart(spec, rtl, p, dims);
  }
}

/**
 * Convert SVG to PNG buffer using sharp
 */
export async function svgToPNG(svgString: string): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  return sharp(Buffer.from(svgString))
    .png()
    .resize(CHART_WIDTH_DEFAULT * 2, CHART_HEIGHT_DEFAULT * 2, { fit: 'inside' }) // 2x for retina
    .toBuffer();
}

/**
 * Generate chart and convert to PNG buffer for PDF embedding
 */
export async function generateChartPNG(spec: ChartSpec, rtl: boolean = true, palette?: ThemePalette): Promise<Buffer> {
  const svg = generateChartSVG(spec, rtl, palette);
  return svgToPNG(svg);
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
