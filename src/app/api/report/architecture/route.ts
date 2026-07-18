import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

// ─── Architecture Report HTML Generator ──────────────────────────────────

function generateArchitectureReportHTML(): string {
  const primaryColor = '#0f172a';
  const secondaryColor = '#1e3a5f';
  const accentColor = '#0d9488';
  const accentLight = '#14b8a6';
  const bgColor = '#ffffff';
  const mutedText = '#64748b';
  const borderColor = '#e2e8f0';
  const codeBg = '#f8fafc';
  const codeBorder = '#cbd5e1';

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DeltaAI — التقرير التقني المعماري</title>
  <style>
    @font-face {
      font-family: 'Cairo';
      src: url('file://${process.cwd()}/src/lib/pdf-engine/fonts/Cairo-Regular.ttf') format('truetype');
      font-weight: 400;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: 'Cairo';
      src: url('file://${process.cwd()}/src/lib/pdf-engine/fonts/Cairo-Bold.ttf') format('truetype');
      font-weight: 700;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: 'CourierPrime';
      src: url('file://${process.cwd()}/src/lib/pdf-engine/fonts/CourierPrime-Regular.ttf') format('truetype');
      font-weight: 400;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: 'CourierPrime';
      src: url('file://${process.cwd()}/src/lib/pdf-engine/fonts/CourierPrime-Bold.ttf') format('truetype');
      font-weight: 700;
      font-style: normal;
      font-display: swap;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      direction: rtl;
      text-align: right;
    }

    body {
      font-family: 'Cairo', Arabic, sans-serif;
      -webkit-font-smoothing: antialiased;
      color: #1e293b;
      font-size: 13px;
      line-height: 1.9;
      background: ${bgColor};
    }

    bdi, [dir="ltr"] {
      direction: ltr;
      text-align: left;
      unicode-bidi: isolate;
    }

    .ltr-isolate {
      unicode-bidi: isolate;
      direction: ltr;
      text-align: left;
    }

    /* ─── Cover Page ─── */
    .cover-page {
      min-height: 100vh;
      background: linear-gradient(135deg, #0a0f1a 0%, ${primaryColor} 40%, ${secondaryColor} 70%, #0d3d5c 100%);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      position: relative;
      overflow: hidden;
      page-break-after: always;
      padding: 60px 40px;
    }

    .cover-page::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      background: radial-gradient(circle at 30% 20%, rgba(13,148,136,0.15) 0%, transparent 50%),
                  radial-gradient(circle at 70% 80%, rgba(13,148,136,0.1) 0%, transparent 50%);
      pointer-events: none;
    }

    .cover-dots {
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      background-image: radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px);
      background-size: 30px 30px;
      pointer-events: none;
    }

    .cover-line-right {
      position: absolute;
      right: 50px;
      top: 10%;
      bottom: 10%;
      width: 2px;
      background: linear-gradient(to bottom, transparent, rgba(13,148,136,0.3), transparent);
    }

    .cover-line-left {
      position: absolute;
      left: 50px;
      top: 10%;
      bottom: 10%;
      width: 2px;
      background: linear-gradient(to bottom, transparent, rgba(13,148,136,0.3), transparent);
    }

    .cover-logo {
      font-size: 80px;
      margin-bottom: 10px;
      text-shadow: 0 0 40px rgba(13,148,136,0.4);
    }

    .cover-brand {
      font-size: 32px;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: 8px;
      margin-bottom: 8px;
    }

    .cover-channel {
      font-size: 16px;
      color: rgba(255,255,255,0.6);
      margin-bottom: 40px;
    }

    .cover-divider {
      width: 120px;
      height: 3px;
      background: linear-gradient(90deg, transparent, ${accentColor}, transparent);
      margin: 20px auto;
    }

    .cover-title {
      font-size: 28px;
      font-weight: 700;
      color: #ffffff;
      text-align: center;
      margin: 20px 0 12px;
    }

    .cover-subtitle {
      font-size: 16px;
      color: rgba(255,255,255,0.7);
      text-align: center;
      max-width: 600px;
      line-height: 1.8;
    }

    .cover-badge {
      display: inline-block;
      margin-top: 30px;
      padding: 8px 24px;
      background: rgba(13,148,136,0.2);
      border: 1px solid rgba(13,148,136,0.4);
      border-radius: 50px;
      color: ${accentLight};
      font-size: 12px;
      font-weight: 700;
    }

    .cover-date {
      position: absolute;
      bottom: 40px;
      color: rgba(255,255,255,0.4);
      font-size: 11px;
    }

    /* ─── TOC Page ─── */
    .toc-page {
      padding: 40px 50px;
      page-break-after: always;
    }

    .toc-title {
      font-size: 24px;
      font-weight: 700;
      color: ${primaryColor};
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .toc-title-icon {
      width: 40px;
      height: 40px;
      background: ${primaryColor};
      color: white;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
    }

    .toc-divider {
      height: 3px;
      background: linear-gradient(90deg, ${accentColor}, ${borderColor}, transparent);
      margin: 16px 0 28px;
    }

    .toc-entry {
      display: flex;
      align-items: center;
      padding: 10px 16px;
      margin-bottom: 6px;
      border-radius: 8px;
      transition: background 0.2s;
    }

    .toc-entry:nth-child(odd) {
      background: #f8fafc;
    }

    .toc-num {
      width: 32px;
      height: 32px;
      background: ${primaryColor};
      color: white;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      font-weight: 700;
      margin-left: 14px;
      flex-shrink: 0;
    }

    .toc-label {
      font-size: 14px;
      font-weight: 500;
      color: ${primaryColor};
      flex: 1;
    }

    .toc-page-num {
      font-size: 12px;
      color: ${mutedText};
      margin-right: 8px;
    }

    /* ─── Content Sections ─── */
    .content-page {
      padding: 20px 50px;
    }

    .section-header {
      margin-bottom: 24px;
      page-break-after: avoid;
    }

    .section-number {
      display: inline-block;
      background: ${primaryColor};
      color: white;
      padding: 4px 14px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 700;
      margin-bottom: 8px;
    }

    .section-title {
      font-size: 22px;
      font-weight: 700;
      color: ${primaryColor};
      margin-bottom: 4px;
      line-height: 1.4;
    }

    .section-subtitle {
      font-size: 13px;
      color: ${mutedText};
    }

    .section-line {
      height: 2px;
      background: linear-gradient(90deg, ${accentColor}, ${borderColor}, transparent);
      margin-top: 12px;
    }

    /* ─── Subsection ─── */
    .subsection {
      margin: 24px 0;
      page-break-inside: avoid;
    }

    .subsection-title {
      font-size: 16px;
      font-weight: 700;
      color: ${secondaryColor};
      margin-bottom: 10px;
      padding-right: 14px;
      border-right: 4px solid ${accentColor};
    }

    .subsection-desc {
      font-size: 13px;
      line-height: 1.9;
      color: #334155;
      margin-bottom: 12px;
    }

    /* ─── Tech Stack Table ─── */
    .tech-table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      margin: 16px 0;
      border-radius: 10px;
      overflow: hidden;
      border: 1px solid ${borderColor};
      page-break-inside: avoid;
    }

    .tech-table thead th {
      background: ${primaryColor};
      color: white;
      padding: 10px 16px;
      font-size: 12px;
      font-weight: 700;
      text-align: right;
    }

    .tech-table tbody td {
      padding: 9px 16px;
      font-size: 12px;
      border-bottom: 1px solid ${borderColor};
      vertical-align: top;
    }

    .tech-table tbody tr:nth-child(even) {
      background: #f8fafc;
    }

    .tech-table tbody tr:last-child td {
      border-bottom: none;
    }

    .tech-category {
      font-weight: 700;
      color: ${primaryColor};
      white-space: nowrap;
    }

    .tech-name {
      direction: ltr;
      text-align: left;
      unicode-bidi: isolate;
      font-family: 'CourierPrime', monospace;
      font-size: 11px;
      color: ${accentColor};
    }

    .tech-desc {
      color: #475569;
    }

    /* ─── Flow Diagram ─── */
    .flow-container {
      background: linear-gradient(135deg, #f0fdfa 0%, #f8fafc 100%);
      border: 1.5px solid rgba(13,148,136,0.3);
      border-radius: 12px;
      padding: 24px;
      margin: 20px 0;
      page-break-inside: avoid;
    }

    .flow-title {
      font-size: 14px;
      font-weight: 700;
      color: ${primaryColor};
      margin-bottom: 16px;
      text-align: center;
    }

    .flow-steps {
      display: flex;
      flex-direction: column;
      gap: 0;
      align-items: center;
    }

    .flow-step {
      display: flex;
      align-items: center;
      width: 100%;
      max-width: 700px;
      gap: 14px;
      padding: 10px 16px;
      background: white;
      border-radius: 10px;
      border: 1px solid ${borderColor};
      box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    }

    .flow-step-num {
      width: 36px;
      height: 36px;
      background: ${primaryColor};
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: 700;
      flex-shrink: 0;
    }

    .flow-step-content {
      flex: 1;
    }

    .flow-step-label {
      font-size: 13px;
      font-weight: 700;
      color: ${primaryColor};
    }

    .flow-step-detail {
      font-size: 11px;
      color: ${mutedText};
    }

    .flow-arrow {
      width: 2px;
      height: 20px;
      background: ${accentColor};
      margin: 0 auto;
      position: relative;
    }

    .flow-arrow::after {
      content: '▼';
      position: absolute;
      bottom: -8px;
      left: 50%;
      transform: translateX(-50%);
      color: ${accentColor};
      font-size: 8px;
    }

    /* ─── Code Block ─── */
    .code-block {
      background: #1e293b;
      border-radius: 10px;
      overflow: hidden;
      margin: 14px 0;
      page-break-inside: avoid;
      direction: ltr;
    }

    .code-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      background: #0f172a;
      border-bottom: 1px solid #334155;
    }

    .code-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }

    .code-dot-red { background: #ef4444; }
    .code-dot-yellow { background: #f59e0b; }
    .code-dot-green { background: #22c55e; }

    .code-filename {
      font-family: 'CourierPrime', monospace;
      font-size: 11px;
      color: #94a3b8;
      margin-right: auto;
      direction: ltr;
      text-align: left;
    }

    .code-lang {
      font-size: 10px;
      color: #64748b;
      background: #334155;
      padding: 2px 8px;
      border-radius: 4px;
      direction: ltr;
    }

    .code-body {
      padding: 14px 18px;
      overflow-x: auto;
    }

    .code-body pre {
      font-family: 'CourierPrime', monospace;
      font-size: 11px;
      line-height: 1.7;
      color: #e2e8f0;
      direction: ltr;
      text-align: left;
      white-space: pre-wrap;
      word-wrap: break-word;
    }

    .code-keyword { color: #c084fc; }
    .code-string { color: #34d399; }
    .code-comment { color: #64748b; }
    .code-function { color: #60a5fa; }
    .code-type { color: #fbbf24; }
    .code-number { color: #f97316; }

    /* ─── Callout Box ─── */
    .callout-box {
      display: flex;
      gap: 12px;
      padding: 14px 18px;
      border-radius: 10px;
      margin: 14px 0;
      page-break-inside: avoid;
    }

    .callout-box-hook {
      border-right: 5px solid ${accentColor};
      background: linear-gradient(135deg, #f0fdfa 0%, #ecfdf5 100%);
    }

    .callout-box-rule {
      border-right: 5px solid #d97706;
      background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%);
    }

    .callout-box-error {
      border-right: 5px solid #dc2626;
      background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%);
    }

    .callout-icon {
      font-size: 20px;
      flex-shrink: 0;
    }

    .callout-content {
      flex: 1;
    }

    .callout-label {
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 4px;
    }

    .callout-label-hook { color: ${accentColor}; }
    .callout-label-rule { color: #b45309; }
    .callout-label-error { color: #b91c1c; }

    .callout-text {
      font-size: 12px;
      line-height: 1.8;
      color: #334155;
    }

    /* ─── Feature Grid ─── */
    .feature-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
      margin: 16px 0;
    }

    .feature-box {
      background: white;
      border: 1px solid ${borderColor};
      border-radius: 10px;
      padding: 16px;
      page-break-inside: avoid;
      box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    }

    .feature-box-full {
      grid-column: 1 / -1;
    }

    .feature-num {
      width: 28px;
      height: 28px;
      background: ${primaryColor};
      color: white;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 700;
      margin-bottom: 8px;
    }

    .feature-title {
      font-size: 13px;
      font-weight: 700;
      color: ${primaryColor};
      margin-bottom: 6px;
    }

    .feature-text {
      font-size: 11px;
      line-height: 1.8;
      color: #475569;
    }

    /* ─── Pipeline Diagram ─── */
    .pipeline-flow {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0;
      margin: 20px 0;
      flex-wrap: wrap;
      direction: ltr;
      page-break-inside: avoid;
    }

    .pipeline-step {
      background: white;
      border: 2px solid ${accentColor};
      border-radius: 12px;
      padding: 12px 18px;
      text-align: center;
      min-width: 120px;
    }

    .pipeline-step-title {
      font-size: 11px;
      font-weight: 700;
      color: ${primaryColor};
      margin-bottom: 2px;
    }

    .pipeline-step-desc {
      font-size: 9px;
      color: ${mutedText};
    }

    .pipeline-arrow {
      font-size: 20px;
      color: ${accentColor};
      margin: 0 4px;
    }

    /* ─── Comparison Table ─── */
    .comparison-table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      margin: 14px 0;
      border-radius: 10px;
      overflow: hidden;
      border: 1px solid ${borderColor};
      page-break-inside: avoid;
    }

    .comparison-table thead th {
      background: ${secondaryColor};
      color: white;
      padding: 8px 14px;
      font-size: 11px;
      font-weight: 700;
      text-align: right;
    }

    .comparison-table tbody td {
      padding: 8px 14px;
      font-size: 11px;
      border-bottom: 1px solid ${borderColor};
    }

    .comparison-table tbody tr:nth-child(even) {
      background: #f8fafc;
    }

    .comparison-table tbody tr:last-child td {
      border-bottom: none;
    }

    /* ─── Recommendation Card ─── */
    .rec-card {
      background: white;
      border: 1px solid ${borderColor};
      border-radius: 10px;
      padding: 16px 20px;
      margin: 12px 0;
      page-break-inside: avoid;
      box-shadow: 0 1px 3px rgba(0,0,0,0.04);
      border-right: 4px solid ${accentColor};
    }

    .rec-card-title {
      font-size: 14px;
      font-weight: 700;
      color: ${primaryColor};
      margin-bottom: 6px;
    }

    .rec-card-body {
      font-size: 12px;
      line-height: 1.8;
      color: #475569;
    }

    .rec-priority {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 50px;
      font-size: 10px;
      font-weight: 700;
      margin-right: 8px;
    }

    .priority-high { background: #fee2e2; color: #b91c1c; }
    .priority-medium { background: #fef3c7; color: #b45309; }
    .priority-low { background: #dcfce7; color: #166534; }

    /* ─── Inline Code ─── */
    code {
      font-family: 'CourierPrime', monospace;
      font-size: 11px;
      background: ${codeBg};
      border: 1px solid ${codeBorder};
      padding: 1px 6px;
      border-radius: 4px;
      direction: ltr;
      text-align: left;
      unicode-bidi: isolate;
    }

    /* ─── Page Break ─── */
    .page-break {
      page-break-before: always;
    }

    /* ─── Bullet List ─── */
    .bullet-list {
      list-style: none;
      padding: 0;
      margin: 10px 0;
    }

    .bullet-list li {
      padding: 4px 0;
      padding-right: 20px;
      position: relative;
      font-size: 13px;
      line-height: 1.8;
    }

    .bullet-list li::before {
      content: '●';
      position: absolute;
      right: 0;
      color: ${accentColor};
      font-size: 8px;
      top: 10px;
    }

    /* ─── Numbered List ─── */
    .numbered-list {
      list-style: none;
      padding: 0;
      margin: 10px 0;
      counter-reset: item;
    }

    .numbered-list li {
      padding: 6px 0;
      padding-right: 36px;
      position: relative;
      font-size: 13px;
      line-height: 1.8;
      counter-increment: item;
    }

    .numbered-list li::before {
      content: counter(item);
      position: absolute;
      right: 0;
      top: 6px;
      width: 24px;
      height: 24px;
      background: ${primaryColor};
      color: white;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 700;
    }

    /* ─── Section End Divider ─── */
    .section-end {
      height: 1px;
      background: ${borderColor};
      margin: 32px 0;
    }

    /* ─── Key-Value Pairs ─── */
    .kv-row {
      display: flex;
      padding: 6px 0;
      border-bottom: 1px dashed ${borderColor};
      font-size: 12px;
    }

    .kv-row:last-child {
      border-bottom: none;
    }

    .kv-key {
      font-weight: 700;
      color: ${primaryColor};
      min-width: 160px;
    }

    .kv-val {
      color: #475569;
      flex: 1;
    }

    /* ─── Print Optimization ─── */
    @media print {
      .cover-page { page-break-after: always; }
      .toc-page { page-break-after: always; }
      .page-break { page-break-before: always; }
      .code-block, .callout-box, .feature-box, .rec-card, .tech-table, .comparison-table {
        break-inside: avoid;
      }
    }
  </style>
</head>
<body>

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<!-- صفحة الغلاف — Cover Page -->
<!-- ═══════════════════════════════════════════════════════════════════════ -->
<div class="cover-page">
  <div class="cover-dots"></div>
  <div class="cover-line-right"></div>
  <div class="cover-line-left"></div>
  <div class="cover-logo">◆</div>
  <div class="cover-brand">DeltaAI</div>
  <div class="cover-channel">بعقل هادي</div>
  <div class="cover-divider"></div>
  <div class="cover-title">التقرير التقني المعماري</div>
  <div class="cover-subtitle">
    تحليل شامل للبنية التقنية والتطبيقية لمنصة DeltaAI الأكاديمية الذكية
    <br>
    من المكدس التقني إلى خط أنابيب توليد PDF وإدارة الخوادم
  </div>
  <div class="cover-badge">Technical Architecture Report v1.0</div>
  <div class="cover-date">مارس 2026 — مراجعة مهندس ذكاء اصطناعي أول</div>
</div>

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<!-- جدول المحتويات — Table of Contents -->
<!-- ═══════════════════════════════════════════════════════════════════════ -->
<div class="toc-page">
  <div class="toc-title">
    <div class="toc-title-icon">☰</div>
    جدول المحتويات
  </div>
  <div class="toc-divider"></div>

  <div class="toc-entry">
    <div class="toc-num">1</div>
    <div class="toc-label">المكدس التقني — Tech Stack</div>
  </div>
  <div class="toc-entry">
    <div class="toc-num">2</div>
    <div class="toc-label">تدفق البيانات — Data Flow</div>
  </div>
  <div class="toc-entry">
    <div class="toc-num">3</div>
    <div class="toc-label">خط أنابيب توليد PDF — PDF Generation Pipeline</div>
  </div>
  <div class="toc-entry">
    <div class="toc-num">4</div>
    <div class="toc-label">محرك التصميم الذكي — Design Reasoning Engine</div>
  </div>
  <div class="toc-entry">
    <div class="toc-num">5</div>
    <div class="toc-label">إعداد الخادم — Server Setup</div>
  </div>
  <div class="toc-entry">
    <div class="toc-num">6</div>
    <div class="toc-label">البنية التحتية Docker — Docker Infrastructure</div>
  </div>
  <div class="toc-entry">
    <div class="toc-num">7</div>
    <div class="toc-label">ملخص التوصيات — Recommendations</div>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<!-- القسم 1: المكدس التقني -->
<!-- ═══════════════════════════════════════════════════════════════════════ -->
<div class="content-page">
  <div class="section-header">
    <div class="section-number">القسم 1</div>
    <div class="section-title">المكدس التقني</div>
    <div class="section-subtitle">Tech Stack — البنية الأساسية لتطبيق Next.js 16 مع Prisma وPlaywright</div>
    <div class="section-line"></div>
  </div>

  <div class="subsection">
    <div class="subsection-title">الإطار الأساسي والمكتبات</div>
    <div class="subsection-desc">
      يعتمد مشروع DeltaAI على إطار عمل Next.js 16 مع App Router كحجر أساس، مع استخدام TypeScript 5 لضمان أمان الأنواع. يتميز المشروع بإخراج مستقل (standalone output) ليتوافق مع بيئة Docker متعددة المراحل على HuggingFace Spaces.
    </div>

    <table class="tech-table">
      <thead>
        <tr>
          <th>الفئة</th>
          <th>التقنية</th>
          <th>الوصف</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="tech-category">الإطار</td>
          <td class="tech-name">Next.js 16 (App Router)</td>
          <td class="tech-desc">إطار عمل React مع توجيه مبني على الملفات، إخراج مستقل، TypeScript 5</td>
        </tr>
        <tr>
          <td class="tech-category">التنسيق</td>
          <td class="tech-name">Tailwind CSS 4 + shadcn/ui</td>
          <td class="tech-desc">نمط New York، أيقونات Lucide، تصميم متجاوب بالكامل</td>
        </tr>
        <tr>
          <td class="tech-category">قاعدة البيانات</td>
          <td class="tech-name">Prisma ORM + PostgreSQL</td>
          <td class="tech-desc">قاعدة بيانات PostgreSQL عبر DATABASE_URL، Prisma Client للوصول مع Connection Pooling</td>
        </tr>
        <tr>
          <td class="tech-category">توليد PDF</td>
          <td class="tech-name">Playwright (Chromium)</td>
          <td class="tech-desc">المحرك الوحيد للتوليد — PDFKit تمت إزالته بالكامل</td>
        </tr>
        <tr>
          <td class="tech-category">الذكاء الاصطناعي</td>
          <td class="tech-name">z-ai-web-dev-sdk (ZAI)</td>
          <td class="tech-desc">تكامل مع HuggingFace Inference API وGradio Spaces</td>
        </tr>
        <tr>
          <td class="tech-category">إدارة الحالة</td>
          <td class="tech-name">Zustand + TanStack Query</td>
          <td class="tech-desc">Zustand للعميل، TanStack Query للخادم</td>
        </tr>
        <tr>
          <td class="tech-category">المصادقة</td>
          <td class="tech-name">Custom Auth + bcrypt + HMAC</td>
          <td class="tech-desc">نظام مصادقة مخصص: bcrypt (12 rounds)، HMAC-signed sessions، OTP عبر البريد</td>
        </tr>
        <tr>
          <td class="tech-category">توليد الصور</td>
          <td class="tech-name">ZAI SDK + Pollinations</td>
          <td class="tech-desc">ZAI كمصدر أساسي، Pollinations كاحتياطي</td>
        </tr>
        <tr>
          <td class="tech-category">النشر</td>
          <td class="tech-name">Docker Multi-Stage</td>
          <td class="tech-desc">16GB RAM، HuggingFace Spaces، بناء من 3 مراحل</td>
        </tr>
        <tr>
          <td class="tech-category">الخدمات المصغرة</td>
          <td class="tech-name">Socket.io Voice Service</td>
          <td class="tech-desc">خدمة صوتية على منفذ منفصل عبر Socket.io</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="callout-box callout-box-hook">
    <div class="callout-icon">⚡</div>
    <div class="callout-content">
      <div class="callout-label callout-label-hook">نقطة مهمة</div>
      <div class="callout-text">
        Playwright هو المحرك <strong>الوحيد</strong> لتوليد PDF — تمت إزالة PDFKit بالكامل من المشروع. هذا القرار يضمن جودة بصرية متسقة ودعم كامل لـ RTL/Arabic عبر محرك Chromium بدلاً من مكتبة Node.js محدودة.
      </div>
    </div>
  </div>

  <div class="subsection">
    <div class="subsection-title">ملفات المفتاحية للمكدس</div>
    <div class="feature-grid">
      <div class="feature-box">
        <div class="feature-num">01</div>
        <div class="feature-title">next.config.ts</div>
        <div class="feature-text">
          إخراج مستقل (standalone)، <code>serverExternalPackages: ["playwright"]</code>، عامل واحد للبناء <code>experimental.cpus: 1</code>
        </div>
      </div>
      <div class="feature-box">
        <div class="feature-num">02</div>
        <div class="feature-title">prisma/schema.prisma</div>
        <div class="feature-text">
          نماذج البيانات: User, Message, Conversation, GenerativeAsset مع علاقات كاملة وقاعدة بيانات PostgreSQL
        </div>
      </div>
      <div class="feature-box">
        <div class="feature-num">03</div>
        <div class="feature-title">Dockerfile</div>
        <div class="feature-text">
          بناء متعدد المراحل: deps → builder → runner مع تثبيت Chromium وضبط الذاكرة
        </div>
      </div>
      <div class="feature-box">
        <div class="feature-num">04</div>
        <div class="feature-title">package.json</div>
        <div class="feature-text">
          50+ مكتبة تشمل: <code>@gradio/client</code>, <code>sharp</code>, <code>framer-motion</code>, <code>react-markdown</code>, <code>socket.io</code>
        </div>
      </div>
    </div>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<!-- القسم 2: تدفق البيانات -->
<!-- ═══════════════════════════════════════════════════════════════════════ -->
<div class="content-page page-break">
  <div class="section-header">
    <div class="section-number">القسم 2</div>
    <div class="section-title">تدفق البيانات</div>
    <div class="section-subtitle">Data Flow — من طلب المستخدم إلى استجابة AI</div>
    <div class="section-line"></div>
  </div>

  <div class="subsection">
    <div class="subsection-title">المسار الأساسي: طلب المستخدم → API → استجابة</div>
    <div class="subsection-desc">
      يمر كل طلب من المستخدم عبر سلسلة من الخطوات المتسلسلة التي تبدأ من واجهة المستخدم وتنتهي بالاستجابة النصية أو المُولَّدة. فيما يلي التدفق الكامل:
    </div>

    <div class="flow-container">
      <div class="flow-title">تدفق البيانات الكامل — User Request → AI API → Response</div>
      <div class="flow-steps">
        <div class="flow-step">
          <div class="flow-step-num">1</div>
          <div class="flow-step-content">
            <div class="flow-step-label">إرسال الرسالة</div>
            <div class="flow-step-detail">ChatInput → POST /api/chat/send أو /api/chat/stream</div>
          </div>
        </div>
        <div class="flow-arrow"></div>
        <div class="flow-step">
          <div class="flow-step-num">2</div>
          <div class="flow-step-content">
            <div class="flow-step-label">التحقق من المصادقة</div>
            <div class="flow-step-detail">Bearer token → getUserFromToken() → فحص الجلسة</div>
          </div>
        </div>
        <div class="flow-arrow"></div>
        <div class="flow-step">
          <div class="flow-step-num">3</div>
          <div class="flow-step-content">
            <div class="flow-step-label">حفظ الرسالة</div>
            <div class="flow-step-detail">Prisma Message model → role="user" → قاعدة البيانات</div>
          </div>
        </div>
        <div class="flow-arrow"></div>
        <div class="flow-step">
          <div class="flow-step-num">4</div>
          <div class="flow-step-content">
            <div class="flow-step-label">توليد استجابة AI</div>
            <div class="flow-step-detail">ZAI SDK / HuggingFace / Pollinations / Gradio</div>
          </div>
        </div>
        <div class="flow-arrow"></div>
        <div class="flow-step">
          <div class="flow-step-num">5</div>
          <div class="flow-step-content">
            <div class="flow-step-label">حفظ الاستجابة</div>
            <div class="flow-step-detail">Message with role="assistant" → قاعدة البيانات</div>
          </div>
        </div>
        <div class="flow-arrow"></div>
        <div class="flow-step">
          <div class="flow-step-num">6</div>
          <div class="flow-step-content">
            <div class="flow-step-label">إرجاع الاستجابة</div>
            <div class="flow-step-detail">SSE (stream) أو JSON (non-stream) → العميل</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="subsection">
    <div class="subsection-title">مزودو AI المتعددون</div>
    <div class="subsection-desc">
      يدعم النظام 4 مسارات لتوليد الاستجابة الذكية، كل مسار مصمم لنوع محدد من الطلبات:
    </div>

    <table class="comparison-table">
      <thead>
        <tr>
          <th>المزود</th>
          <th>SDK / المكتبة</th>
          <th>نوع الاستخدام</th>
          <th>نقطة النهاية</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="font-weight:700;color:${primaryColor};">ZAI SDK</td>
          <td><code>z-ai-web-dev-sdk</code></td>
          <td>المحادثات الذكية (Chat Completions)</td>
          <td><code>/api/chat/send</code></td>
        </tr>
        <tr>
          <td style="font-weight:700;color:${primaryColor};">HuggingFace</td>
          <td><code>@huggingface/inference</code></td>
          <td>نماذج HF المفتوحة (Qwen, Mistral...)</td>
          <td><code>/api/ai/hf/chat</code></td>
        </tr>
        <tr>
          <td style="font-weight:700;color:${primaryColor};">Pollinations</td>
          <td><code>fetch API</code></td>
          <td>توليد الصور (احتياطي)</td>
          <td><code>/api/ai/image</code></td>
        </tr>
        <tr>
          <td style="font-weight:700;color:${primaryColor};">Gradio Client</td>
          <td><code>@gradio/client</code></td>
          <td>توليد المستندات (PPTX/PDF)</td>
          <td><code>/api/ai/hf/document</code></td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="callout-box callout-box-rule">
    <div class="callout-icon">🏆</div>
    <div class="callout-content">
      <div class="callout-label callout-label-rule">قاعدة معمارية</div>
      <div class="callout-text">
        جميع طلبات AI تمر عبر طبقة API موحدة على الخادم — لا يتم استدعاء أي مزود AI مباشرة من العميل. هذا يضمن أمان مفاتيح API، تتبع الاستخدام، وتخزين الرسائل.
      </div>
    </div>
  </div>

  <div class="subsection">
    <div class="subsection-title">نقاط النهاية الرئيسية (API Routes)</div>
    <div class="kv-row">
      <div class="kv-key">المحادثة</div>
      <div class="kv-val"><code>/api/chat/send</code> (POST) — إرسال رسالة والحصول على رد</div>
    </div>
    <div class="kv-row">
      <div class="kv-key">البث المباشر</div>
      <div class="kv-val"><code>/api/chat/stream</code> (POST) — بث الاستجابة عبر SSE</div>
    </div>
    <div class="kv-row">
      <div class="kv-key">توليد PDF</div>
      <div class="kv-val"><code>/api/ai/hf/document</code> (POST) — المسار الموحد لتوليد المستندات (PDF/PPTX/XLSX/DOCX)</div>
    </div>
    <div class="kv-row">
      <div class="kv-key">المستندات</div>
      <div class="kv-val"><code>/api/ai/hf/document</code> (POST) — توليد مستند محلي أو عبر Gradio</div>
    </div>
    <div class="kv-row">
      <div class="kv-key">الصور</div>
      <div class="kv-val"><code>/api/ai/image</code> (POST) — توليد صورة عبر ZAI/Pollinations</div>
    </div>
    <div class="kv-row">
      <div class="kv-key">النماذج</div>
      <div class="kv-val"><code>/api/ai/models</code> (GET) — قائمة النماذج المتاحة</div>
    </div>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<!-- القسم 3: خط أنابيب توليد PDF -->
<!-- ═══════════════════════════════════════════════════════════════════════ -->
<div class="content-page page-break">
  <div class="section-header">
    <div class="section-number">القسم 3</div>
    <div class="section-title">خط أنابيب توليد PDF</div>
    <div class="section-subtitle">PDF Generation Pipeline — المحرك الأساسي: Content → Design → HTML → Playwright → PDF</div>
    <div class="section-line"></div>
  </div>

  <div class="subsection">
    <div class="subsection-title">نظرة عامة على الأنابيب</div>
    <div class="subsection-desc">
      يمثل خط الأنابيب جوهر المنصة — يحول المحتوى النصي إلى مستندات PDF احترافية عبر 4 مراحل متسلسلة، كل مرحلة مستقلة قابلة للاختبار والاستبدال.
    </div>

    <div class="pipeline-flow">
      <div class="pipeline-step">
        <div class="pipeline-step-title">المحتوى</div>
        <div class="pipeline-step-desc">Markdown / نص</div>
      </div>
      <div class="pipeline-arrow">→</div>
      <div class="pipeline-step">
        <div class="pipeline-step-title">التصميم</div>
        <div class="pipeline-step-desc">Design Reasoning</div>
      </div>
      <div class="pipeline-arrow">→</div>
      <div class="pipeline-step">
        <div class="pipeline-step-title">HTML</div>
        <div class="pipeline-step-desc">Template Engine</div>
      </div>
      <div class="pipeline-arrow">→</div>
      <div class="pipeline-step">
        <div class="pipeline-step-title">Playwright</div>
        <div class="pipeline-step-desc">Chromium PDF</div>
      </div>
      <div class="pipeline-arrow">→</div>
      <div class="pipeline-step">
        <div class="pipeline-step-title">ملف PDF</div>
        <div class="pipeline-step-desc">حفظ وتحميل</div>
      </div>
    </div>
  </div>

  <div class="subsection">
    <div class="subsection-title">الملفات الرئيسية</div>
    <div class="kv-row">
      <div class="kv-key"><code>rendering-pipeline.ts</code></div>
      <div class="kv-val">المنسق الرئيسي — يربط جميع المراحل</div>
    </div>
    <div class="kv-row">
      <div class="kv-key"><code>playwright-renderer.ts</code></div>
      <div class="kv-val">محول Playwright → PDF مع إدارة دورة حياة المتصفح</div>
    </div>
    <div class="kv-row">
      <div class="kv-key"><code>html-template-generator.ts</code></div>
      <div class="kv-val">محرك قوالب HTML — 1700+ سطر مع تحليل Markdown</div>
    </div>
    <div class="kv-row">
      <div class="kv-key"><code>design-reasoning.ts</code></div>
      <div class="kv-val">محرك التصميم الذكي — تحليل نفسية المحتوى</div>
    </div>
    <div class="kv-row">
      <div class="kv-key"><code>pdf-engine.ts</code></div>
      <div class="kv-val">نقطة الدخول لمحرك PDF</div>
    </div>
    <div class="kv-row">
      <div class="kv-key"><code>/api/ai/hf/document/route.ts</code></div>
      <div class="kv-val">نقطة نهاية API الموحدة لتوليد المستندات (PDF/PPTX)</div>
    </div>
  </div>

  <div class="subsection">
    <div class="subsection-title">المرحلة 1: تحليل نفسية المحتوى (Design Reasoning)</div>
    <div class="subsection-desc">
      تحلل هذه المرحلة المحتوى لاستنتاج النوع النفسي (Content Psychology) والتصميم البصري المناسب. يمكن تشغيلها عبر LLM (ZAI SDK) أو تحليل قائم على القواعد كاحتياطي.
    </div>

    <div class="feature-grid">
      <div class="feature-box">
        <div class="feature-num">α</div>
        <div class="feature-title">تحليل النوع النفسي</div>
        <div class="feature-text">
          7 أنواع محتوى: <code>financial</code>, <code>academic</code>, <code>medical</code>, <code>islamic</code>, <code>creative</code>, <code>technical</code>, <code>legal</code>
          <br>
          كل نوع له: مستوى الطاقة، الرسمية، الجمهور المستهدف
        </div>
      </div>
      <div class="feature-box">
        <div class="feature-num">β</div>
        <div class="feature-title">اللغة البصرية</div>
        <div class="feature-text">
          ألوان ديناميكية حسب النوع — <strong>قاعدة صارمة: لا وردي، لا بنفسجي</strong>
          <br>
          أساسي: <code>#0f172a</code> ثانوي: <code>#1e3a5f</code> تمييز: حسب النوع
        </div>
      </div>
      <div class="feature-box">
        <div class="feature-num">γ</div>
        <div class="feature-title">خريطة المكونات</div>
        <div class="feature-text">
          تحويل الأقسام إلى مكونات بصرية: شبكة بطاقات، جدول مقارنة، خط زمني، مخطط إحصائي، قائمة تعريفات
        </div>
      </div>
      <div class="feature-box">
        <div class="feature-num">δ</div>
        <div class="feature-title">مواصفات الرسوم البيانية</div>
        <div class="feature-text">
          استخراج بيانات رقمية تلقائياً من المحتوى وتوليد مواصفات رسوم بيانية: bar, line, pie, radar, scatter
        </div>
      </div>
    </div>

    <div class="code-block">
      <div class="code-header">
        <div class="code-dot code-dot-red"></div>
        <div class="code-dot code-dot-yellow"></div>
        <div class="code-dot code-dot-green"></div>
        <div class="code-filename">design-reasoning.ts</div>
        <div class="code-lang">TypeScript</div>
      </div>
      <div class="code-body">
<pre><span class="code-keyword">const</span> PSYCHOLOGY_RULES: <span class="code-type">Record</span>&lt;<span class="code-type">ContentPsychology</span>[<span class="code-string">'type'</span>], {...}&gt; = {
  <span class="code-string">financial</span>:  { primaryColor: <span class="code-string">'#0f172a'</span>, accentColor: <span class="code-string">'#d97706'</span>, headingStyle: <span class="code-string">'bold-serif'</span>   },
  <span class="code-string">academic</span>:   { primaryColor: <span class="code-string">'#0f172a'</span>, accentColor: <span class="code-string">'#0d9488'</span>, headingStyle: <span class="code-string">'elegant-sans'</span> },
  <span class="code-string">medical</span>:    { primaryColor: <span class="code-string">'#0f172a'</span>, accentColor: <span class="code-string">'#dc2626'</span>, headingStyle: <span class="code-string">'modern-geometric'</span> },
  <span class="code-string">islamic</span>:    { primaryColor: <span class="code-string">'#0f172a'</span>, accentColor: <span class="code-string">'#059669'</span>, headingStyle: <span class="code-string">'elegant-sans'</span> },
  <span class="code-string">creative</span>:   { primaryColor: <span class="code-string">'#0f172a'</span>, accentColor: <span class="code-string">'#0d9488'</span>, headingStyle: <span class="code-string">'modern-geometric'</span> },
  <span class="code-string">technical</span>:  { primaryColor: <span class="code-string">'#0f172a'</span>, accentColor: <span class="code-string">'#0d9488'</span>, headingStyle: <span class="code-string">'modern-geometric'</span> },
  <span class="code-string">legal</span>:      { primaryColor: <span class="code-string">'#0f172a'</span>, accentColor: <span class="code-string">'#d97706'</span>, headingStyle: <span class="code-string">'bold-serif'</span>   },
};</pre>
      </div>
    </div>
  </div>

  <div class="subsection">
    <div class="subsection-title">المرحلة 2: توليد قالب HTML</div>
    <div class="subsection-desc">
      يحلل محرك القوالب محتوى Markdown إلى أقسام وكتل منظمة (ParsedSection/ParsedBlock)، ثم يولد HTML مع CSS احترافي يدعم RTL/BiDi وخطوط Cairo العربية.
    </div>

    <div class="feature-grid">
      <div class="feature-box">
        <div class="feature-num">i</div>
        <div class="feature-title">العناصر المدعومة</div>
        <div class="feature-text">
          عناوين، فقرات، قوائم مرقمة ونقطية، جداول، اقتباسات، كود، تعريفات، ملاحظات/تحذيرات/نصائح
        </div>
      </div>
      <div class="feature-box">
        <div class="feature-num">ii</div>
        <div class="feature-title">المكونات المتقدمة</div>
        <div class="feature-text">
          صفحة غلاف، فهرس محتويات، رؤوس أقسام، جداول بيانات (zebra)، بطاقات شبكية، خط زمني، مخطط تدفق، رسوم SVG
        </div>
      </div>
      <div class="feature-box feature-box-full">
        <div class="feature-num">iii</div>
        <div class="feature-title">كتل المحتوى الخاصة</div>
        <div class="feature-text">
          :::callout-hook (رؤية صادمة)، :::callout-rule (قاعدة ذهبية)، :::callout-error (خطأ شائع)، :::feature (ميزة مرقمة) — كل نوع له تصميم بصري مختلف وأيقونة مميزة
        </div>
      </div>
    </div>

    <div class="callout-box callout-box-hook">
      <div class="callout-icon">⚡</div>
      <div class="callout-content">
        <div class="callout-label callout-label-hook">رؤية تقنية</div>
        <div class="callout-text">
          محرك القوالب يتعامل مع أكثر من 15 نوع كتلة مختلف، مع دعم كامل لـ RTL وخط Cairo. التحليل يتم عبر regex متسلسل بدلاً من parser معقد — هذا القرار يقلل التعقيد ويزيد الموثوقية.
        </div>
      </div>
    </div>
  </div>

  <div class="subsection">
    <div class="subsection-title">المرحلة 3: التوليد عبر Playwright</div>
    <div class="subsection-desc">
      يستخدم Playwright (Chromium headless) لتحويل HTML إلى PDF بجودة عالية مع دعم كامل لـ RTL والخطوط العربية والخلفيات المطبوعة.
    </div>

    <div class="code-block">
      <div class="code-header">
        <div class="code-dot code-dot-red"></div>
        <div class="code-dot code-dot-yellow"></div>
        <div class="code-dot code-dot-green"></div>
        <div class="code-filename">playwright-renderer.ts</div>
        <div class="code-lang">TypeScript</div>
      </div>
      <div class="code-body">
<pre><span class="code-comment">// ─── Browser Launch with Memory Constraints ───</span>
<span class="code-keyword">const</span> browser = <span class="code-keyword">await</span> chromium.<span class="code-function">launch</span>({
  headless: <span class="code-keyword">true</span>,
  args: [
    <span class="code-string">'--no-sandbox'</span>,
    <span class="code-string">'--disable-setuid-sandbox'</span>,
    <span class="code-string">'--disable-dev-shm-usage'</span>,
    <span class="code-string">'--disable-gpu'</span>,
    <span class="code-string">'--js-flags=--max-old-space-size=1024'</span>,
    <span class="code-comment">// Note: --single-process REMOVED — crashes in Docker</span>
  ],
});</pre>
      </div>
    </div>

    <div class="code-block">
      <div class="code-header">
        <div class="code-dot code-dot-red"></div>
        <div class="code-dot code-dot-yellow"></div>
        <div class="code-dot code-dot-green"></div>
        <div class="code-filename">playwright-renderer.ts</div>
        <div class="code-lang">TypeScript</div>
      </div>
      <div class="code-body">
<pre><span class="code-comment">// ─── RTL Enforcement ───</span>
<span class="code-keyword">function</span> <span class="code-function">enforceRTLAndInjectStyles</span>(html, language, designReasoning) {
  <span class="code-keyword">const</span> fontCSS = <span class="code-string">\`@font-face { font-family: 'Cairo';
    src: url('file://...Cairo-Regular.ttf'); }\`</span>;
  <span class="code-keyword">const</span> rtlCSS = <span class="code-string">\`* { direction: rtl; text-align: right; }
    bdi, [dir="ltr"] { direction: ltr; unicode-bidi: isolate; }\`</span>;
  <span class="code-comment">// Inject into &lt;head&gt; before &lt;/head&gt;</span>
  <span class="code-keyword">return</span> modified;
}</pre>
      </div>
    </div>

    <div class="code-block">
      <div class="code-header">
        <div class="code-dot code-dot-red"></div>
        <div class="code-dot code-dot-yellow"></div>
        <div class="code-dot code-dot-green"></div>
        <div class="code-filename">playwright-renderer.ts</div>
        <div class="code-lang">TypeScript</div>
      </div>
      <div class="code-body">
<pre><span class="code-comment">// ─── PDF Generation with 60s Timeout ───</span>
<span class="code-keyword">const</span> pdfBuffer = <span class="code-keyword">await</span> <span class="code-type">Promise</span>.<span class="code-function">race</span>([
  page.<span class="code-function">pdf</span>({
    format: <span class="code-string">'A4'</span>,
    margin: { top: <span class="code-string">'25mm'</span>, bottom: <span class="code-string">'20mm'</span>, left: <span class="code-string">'18mm'</span>, right: <span class="code-string">'18mm'</span> },
    printBackground: <span class="code-keyword">true</span>,
    displayHeaderFooter: <span class="code-keyword">true</span>,
    headerTemplate: <span class="code-string">\`DeltaAI | بعقل هادي\`</span>,
    footerTemplate: <span class="code-string">\`صفحة X من Y\`</span>,
  }),
  <span class="code-keyword">new</span> <span class="code-type">Promise</span>((_, reject) =&gt;
    <span class="code-function">setTimeout</span>(() =&gt; <span class="code-function">reject</span>(<span class="code-keyword">new</span> <span class="code-type">Error</span>(<span class="code-string">'PDF generation timed out (60s)'</span>)), <span class="code-number">60000</span>)
  ),
]);</pre>
      </div>
    </div>
  </div>

  <div class="subsection">
    <div class="subsection-title">المرحلة 4: حفظ الملف</div>
    <div class="subsection-desc">
      بعد توليد الـ PDF buffer، يتم حفظه في مجلد <code>download/</code> باسم UUID فريد، مع تسجيل الأصل في قاعدة البيانات عبر Prisma (GenerativeAsset).
    </div>

    <div class="code-block">
      <div class="code-header">
        <div class="code-dot code-dot-red"></div>
        <div class="code-dot code-dot-yellow"></div>
        <div class="code-dot code-dot-green"></div>
        <div class="code-filename">rendering-pipeline.ts</div>
        <div class="code-lang">TypeScript</div>
      </div>
      <div class="code-body">
<pre><span class="code-comment">// ─── Step 4: Save PDF Buffer to File ───</span>
<span class="code-keyword">const</span> downloadDir = <span class="code-function">join</span>(process.<span class="code-function">cwd</span>(), <span class="code-string">'download'</span>);
<span class="code-keyword">if</span> (!<span class="code-function">existsSync</span>(downloadDir)) {
  <span class="code-function">mkdirSync</span>(downloadDir, { recursive: <span class="code-keyword">true</span> });
}
<span class="code-keyword">const</span> outputPath = <span class="code-function">join</span>(downloadDir, <span class="code-string">\`\${randomUUID()}.pdf\`</span>);
<span class="code-function">writeFileSync</span>(outputPath, pdfBuffer);

<span class="code-keyword">return</span> {
  success: <span class="code-keyword">true</span>, pdfBuffer, filePath: outputPath,
  designReasoning, rendererUsed: <span class="code-string">'playwright'</span>,
  duration: Date.<span class="code-function">now</span>() - startTime,
};</pre>
      </div>
    </div>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<!-- القسم 4: محرك التصميم الذكي -->
<!-- ═══════════════════════════════════════════════════════════════════════ -->
<div class="content-page page-break">
  <div class="section-header">
    <div class="section-number">القسم 4</div>
    <div class="section-title">محرك التصميم الذكي</div>
    <div class="section-subtitle">Design Reasoning Engine — التحليل النفسي للمحتوى والتوليد البصري التلقائي</div>
    <div class="section-line"></div>
  </div>

  <div class="subsection">
    <div class="subsection-title">كيف يعمل المحرك</div>
    <div class="subsection-desc">
      يعتمد محرك التصميم الذكي على تحليل محتوى النص باستخدام كلمات مفتاحية مرجعية لتحديد "نفسية المحتوى" — وهو تصنيف يحدد الأسلوب البصري الأمثل. يمكن تشغيله عبر LLM أو عبر محرك قواعد ثابت كاحتياطي.
    </div>

    <div class="flow-container">
      <div class="flow-title">سير عمل محرك التصميم الذكي</div>
      <div class="flow-steps">
        <div class="flow-step">
          <div class="flow-step-num">A</div>
          <div class="flow-step-content">
            <div class="flow-step-label">تحليل المحتوى</div>
            <div class="flow-step-detail">مطابقة كلمات مفتاحية → تحديد النوع النفسي (7 أنواع)</div>
          </div>
        </div>
        <div class="flow-arrow"></div>
        <div class="flow-step">
          <div class="flow-step-num">B</div>
          <div class="flow-step-content">
            <div class="flow-step-label">تحديد الرسمية</div>
            <div class="flow-step-detail">أنماط رسمية مقابل عامية → formal / semi-formal / casual</div>
          </div>
        </div>
        <div class="flow-arrow"></div>
        <div class="flow-step">
          <div class="flow-step-num">C</div>
          <div class="flow-step-content">
            <div class="flow-step-label">توليد اللغة البصرية</div>
            <div class="flow-step-detail">ألوان + خطوط + مسافات + حدود → VisualLanguage</div>
          </div>
        </div>
        <div class="flow-arrow"></div>
        <div class="flow-step">
          <div class="flow-step-num">D</div>
          <div class="flow-step-content">
            <div class="flow-step-label">خريطة المكونات</div>
            <div class="flow-step-detail">تحويل الأقسام → مكونات بصرية مناسبة</div>
          </div>
        </div>
        <div class="flow-arrow"></div>
        <div class="flow-step">
          <div class="flow-step-num">E</div>
          <div class="flow-step-content">
            <div class="flow-step-label">استخراج الرسوم</div>
            <div class="flow-step-detail">بيانات رقمية تلقائية → ChartSpec (bar/line/pie/radar)</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="subsection">
    <div class="subsection-title">جدول أنواع المحتوى النفسي</div>
    <table class="comparison-table">
      <thead>
        <tr>
          <th>النوع</th>
          <th>اللون التمييزي</th>
          <th>نمط العناوين</th>
          <th>المسافات</th>
          <th>الجمهور</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="font-weight:700;">مالي (Financial)</td>
          <td><code>#d97706</code> (كهرماني)</td>
          <td>bold-serif</td>
          <td>compact</td>
          <td>المستثمرون والمحللون</td>
        </tr>
        <tr>
          <td style="font-weight:700;">أكاديمي (Academic)</td>
          <td><code>#0d9488</code> (أخضر مائل)</td>
          <td>elegant-sans</td>
          <td>comfortable</td>
          <td>الباحثون والأكاديميون</td>
        </tr>
        <tr>
          <td style="font-weight:700;">طبي (Medical)</td>
          <td><code>#dc2626</code> (أحمر)</td>
          <td>modern-geometric</td>
          <td>comfortable</td>
          <td>الأطباء والمتخصصون</td>
        </tr>
        <tr>
          <td style="font-weight:700;">إسلامي (Islamic)</td>
          <td><code>#059669</code> (زمردي)</td>
          <td>elegant-sans</td>
          <td>spacious</td>
          <td>الباحثون الشرعيون</td>
        </tr>
        <tr>
          <td style="font-weight:700;">أدبي (Creative)</td>
          <td><code>#0d9488</code> (أخضر مائل)</td>
          <td>modern-geometric</td>
          <td>spacious</td>
          <td>الأدباء والمبدعون</td>
        </tr>
        <tr>
          <td style="font-weight:700;">تقني (Technical)</td>
          <td><code>#0d9488</code> (أخضر مائل)</td>
          <td>modern-geometric</td>
          <td>compact</td>
          <td>المطورون والمهندسون</td>
        </tr>
        <tr>
          <td style="font-weight:700;">قانوني (Legal)</td>
          <td><code>#d97706</code> (كهرماني)</td>
          <td>bold-serif</td>
          <td>comfortable</td>
          <td>المحامون والقانونيون</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="callout-box callout-box-error">
    <div class="callout-icon">🚫</div>
    <div class="callout-content">
      <div class="callout-label callout-label-error">تحذير: قاعدة الألوان الصارمة</div>
      <div class="callout-text">
        <strong>لا وردي (Pink)</strong> و <strong>لا بنفسجي (Purple)</strong> — هذه القاعدة مطبقة على مستوى النظام بالكامل: PSYCHOLOGY_RULES، LLM prompt، وHTML template generator. أي تجاوز يتم اكتشافه وإصلاحه تلقائياً.
      </div>
    </div>
  </div>

  <div class="subsection">
    <div class="subsection-title">استراتيجية الاحتياطي (Fallback)</div>
    <div class="subsection-desc">
      عند فشل LLM (نظراً لمشاكل الذاكرة مع Playwright)، يتحول النظام تلقائياً إلى التحليل القائم على القواعد:
    </div>
    <ul class="numbered-list">
      <li><strong>التحليل عبر الكلمات المفتاحية</strong> — كل نوع نفسي له قائمة كلمات عربية وإنجليزية</li>
      <li><strong>تحديد الرسمية</strong> — أنماط عامية مقابل رسمية عبر regex</li>
      <li><strong>استخراج البيانات الرقمية</strong> — أنماط مثل "تصنيف: رقم" أو "نسبة%"</li>
      <li><strong>خريطة المكونات الافتراضية</strong> — كل نوع نفسي له مكونات بصرية مفضلة</li>
    </ul>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<!-- القسم 5: إعداد الخادم -->
<!-- ═══════════════════════════════════════════════════════════════════════ -->
<div class="content-page page-break">
  <div class="section-header">
    <div class="section-number">القسم 5</div>
    <div class="section-title">إعداد الخادم</div>
    <div class="section-subtitle">Server Setup — دورة حياة المتصفح، إدارة الذاكرة، نظام الطوابير</div>
    <div class="section-line"></div>
  </div>

  <div class="subsection">
    <div class="subsection-title">دورة حياة المتصفح (Browser Lifecycle)</div>
    <div class="subsection-desc">
      يدير النظام مثيل متصفح Chromium واحد (Singleton) مع تهيئة كسولة (lazy initialization) وإعادة تشغيل تلقائية عند الأعطال.
    </div>

    <div class="feature-grid">
      <div class="feature-box">
        <div class="feature-num">01</div>
        <div class="feature-title">Singleton Browser</div>
        <div class="feature-text">
          مثيل متصفح واحد مشترك — تهيئة كسولة عند أول طلب. <code>browserInstance</code> متغير عام يتم إعادة استخدامه.
        </div>
      </div>
      <div class="feature-box">
        <div class="feature-num">02</div>
        <div class="feature-title">إعادة تشغيل تلقائية</div>
        <div class="feature-text">
          عند OOM أو انقطاع الاتصال: <code>restartBrowser()</code> يغلق المثيل الحالي ويطلق واحد جديد. حد أقصى: 3 مرات.
        </div>
      </div>
      <div class="feature-box">
        <div class="feature-num">03</div>
        <div class="feature-title">عزل لكل طلب</div>
        <div class="feature-text">
          كل عملية توليد تحصل على <code>BrowserContext</code> + <code>Page</code> جديدين — عزل كامل بين الطلبات لمنع تسرب البيانات.
        </div>
      </div>
      <div class="feature-box">
        <div class="feature-num">04</div>
        <div class="feature-title">معالجات الإغلاق</div>
        <div class="feature-text">
          <code>SIGTERM</code>, <code>SIGINT</code>, <code>SIGHUP</code> — يتم إغلاق المتصفح بأمان قبل إنهاء العملية.
        </div>
      </div>
    </div>
  </div>

  <div class="callout-box callout-box-error">
    <div class="callout-icon">🚫</div>
    <div class="callout-content">
      <div class="callout-label callout-label-error">خطأ تم إصلاحه</div>
      <div class="callout-text">
        تم <strong>إزالة</strong> علامة <code>--single-process</code> من إعدادات Chromium — كانت تسبب أعطالاً متكررة في حاويات Docker ولا تتوافق مع البنية متعددة العمليات لـ Chromium.
      </div>
    </div>
  </div>

  <div class="subsection">
    <div class="subsection-title">إدارة الذاكرة (Memory Management)</div>
    <div class="subsection-desc">
      يعمل النظام في بيئة محدودة الذاكرة (16GB RAM على HuggingFace Spaces). تم اتخاذ عدة إجراءات لضمان الاستقرار:
    </div>

    <table class="comparison-table">
      <thead>
        <tr>
          <th>المكون</th>
          <th>الإعداد</th>
          <th>القيمة</th>
          <th>الغرض</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="font-weight:700;">Next.js Build</td>
          <td><code>NODE_OPTIONS</code></td>
          <td><code>--max-old-space-size=6144</code></td>
          <td>6GB heap للبناء</td>
        </tr>
        <tr>
          <td style="font-weight:700;">Chromium V8</td>
          <td><code>--js-flags</code></td>
          <td><code>--max-old-space-size=1024</code></td>
          <td>1GB حد لـ Chromium</td>
        </tr>
        <tr>
          <td style="font-weight:700;">Next.js Config</td>
          <td><code>serverExternalPackages</code></td>
          <td><code>["playwright"]</code></td>
          <td>عزل Playwright عن الحزمة</td>
        </tr>
        <tr>
          <td style="font-weight:700;">Build Workers</td>
          <td><code>experimental.cpus</code></td>
          <td><code>1</code></td>
          <td>عامل واحد فقط للبناء</td>
        </tr>
        <tr>
          <td style="font-weight:700;">Browser Restart</td>
          <td><code>MAX_RESTARTS</code></td>
          <td><code>3</code></td>
          <td>حد أقصى لإعادة التشغيل</td>
        </tr>
        <tr>
          <td style="font-weight:700;">PDF Timeout</div>
          <td><code>Promise.race</code></td>
          <td><code>60000ms</code></td>
          <td>مهلة توليد PDF</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="subsection">
    <div class="subsection-title">نظام الطوابير (Queue System)</div>
    <div class="subsection-desc">
      لا يوجد نظام طوابير رسمي — الطلبات تُعالج بشكل تسلسلي عبر API routes غير متزامنة. نقطة نهاية واحدة فقط لكل طلب، مع معالجة دفعية عبر <code>batch-processor.ts</code> بحد أقصى 12 محاضرة.
    </div>

    <div class="callout-box callout-box-rule">
      <div class="callout-icon">🏆</div>
      <div class="callout-content">
        <div class="callout-label callout-label-rule">قاعدة التصميم</div>
        <div class="callout-text">
          النظام مصمم للاستخدام الفردي (single-user) أو الاستخدام المتزامن المحدود. في بيئة HuggingFace Spaces، لا حاجة لنظام طوابير معقد — الطلبات المتوازية تُدار عبر Node.js event loop بشكل طبيعي.
        </div>
      </div>
    </div>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<!-- القسم 6: البنية التحتية Docker -->
<!-- ═══════════════════════════════════════════════════════════════════════ -->
<div class="content-page page-break">
  <div class="section-header">
    <div class="section-number">القسم 6</div>
    <div class="section-title">البنية التحتية Docker</div>
    <div class="section-subtitle">Docker Infrastructure — بناء متعدد المراحل ونشر HuggingFace Spaces</div>
    <div class="section-line"></div>
  </div>

  <div class="subsection">
    <div class="subsection-title">البناء المتعدد المراحل (Multi-Stage Build)</div>
    <div class="subsection-desc">
      يتكون Dockerfile من 3 مراحل متتالية، كل مرحلة لها غرض محدد وحجم صورة محسن:
    </div>

    <div class="flow-container">
      <div class="flow-title">Docker Multi-Stage Build Pipeline</div>
      <div class="flow-steps">
        <div class="flow-step">
          <div class="flow-step-num">1</div>
          <div class="flow-step-content">
            <div class="flow-step-label">المرحلة: deps</div>
            <div class="flow-step-detail">bun install → prisma generate → تثبيت التبعيات</div>
          </div>
        </div>
        <div class="flow-arrow"></div>
        <div class="flow-step">
          <div class="flow-step-num">2</div>
          <div class="flow-step-content">
            <div class="flow-step-label">المرحلة: builder</div>
            <div class="flow-step-detail">نسخ التبعيات → بناء Next.js → standalone output</div>
          </div>
        </div>
        <div class="flow-arrow"></div>
        <div class="flow-step">
          <div class="flow-step-num">3</div>
          <div class="flow-step-content">
            <div class="flow-step-label">المرحلة: runner</div>
            <div class="flow-step-detail">تثبيت Chromium → نسخ standalone → إعداد البيئة</div>
          </div>
        </div>
      </div>
    </div>

    <div class="feature-grid">
      <div class="feature-box">
        <div class="feature-num">01</div>
        <div class="feature-title">مرحلة التبعيات (deps)</div>
        <div class="feature-text">
          تثبيت جميع حزم npm عبر bun، توليد Prisma Client، تحضير بيئة التطوير
        </div>
      </div>
      <div class="feature-box">
        <div class="feature-num">02</div>
        <div class="feature-title">مرحلة البناء (builder)</div>
        <div class="feature-text">
          نسخ التبعيات من المرحلة الأولى، تشغيل <code>next build</code> مع إخراج مستقل (standalone)
        </div>
      </div>
      <div class="feature-box feature-box-full">
        <div class="feature-num">03</div>
        <div class="feature-title">مرحلة التشغيل (runner)</div>
        <div class="feature-text">
          تثبيت تبعيات نظام Chromium (libnss3, libnspr4, libatk1.0-0, libatk-bridge2.0-0, libcups2, libdrm2, libxkbcommon0, libxcomposite1, libxdamage1, libxrandr2, libgbm1, libasound2) — نسخ إخراج standalone — تثبيت Chromium binary — أمر التشغيل: إنشاء ZAI config → db push → seed → server.js
        </div>
      </div>
    </div>
  </div>

  <div class="subsection">
    <div class="subsection-title">أمر التشغيل (CMD)</div>

    <div class="code-block">
      <div class="code-header">
        <div class="code-dot code-dot-red"></div>
        <div class="code-dot code-dot-yellow"></div>
        <div class="code-dot code-dot-green"></div>
        <div class="code-filename">Dockerfile</div>
        <div class="code-lang">Dockerfile</div>
      </div>
      <div class="code-body">
<pre><span class="code-comment"># ─── Startup Sequence ───</span>
<span class="code-function">CMD</span> create-zai-config.sh   <span class="code-comment"># ← Create ZAI SDK config</span>
  && bun run db:push        <span class="code-comment"># ← Push Prisma schema</span>
  && bun run db:seed        <span class="code-comment"># ← Seed database</span>
  && node server.js         <span class="code-comment"># ← Start Next.js standalone</span></pre>
      </div>
    </div>
  </div>

  <div class="subsection">
    <div class="subsection-title">متغيرات البيئة الرئيسية</div>
    <table class="comparison-table">
      <thead>
        <tr>
          <th>المتغير</th>
          <th>القيمة</th>
          <th>الوصف</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="font-weight:700;"><code>NODE_OPTIONS</code></td>
          <td><code>--max-old-space-size=6144</code></td>
          <td>6GB ذاكرة لبناء Next.js</td>
        </tr>
        <tr>
          <td style="font-weight:700;"><code>PLAYWRIGHT_BROWSERS_PATH</code></td>
          <td><code>/opt/chromium</code></td>
          <td>مسار تثبيت Chromium</td>
        </tr>
        <tr>
          <td style="font-weight:700;"><code>PORT</code></td>
          <td><code>3000</code></td>
          <td>منفذ الخادم الداخلي</td>
        </tr>
        <tr>
          <td style="font-weight:700;"><code>ZAI_CONFIG_PATH</code></td>
          <td><code>/app/config/zai.json</code></td>
          <td>مسار إعدادات ZAI SDK</td>
        </tr>
      </tbody>
    </table>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<!-- القسم 7: ملخص التوصيات -->
<!-- ═══════════════════════════════════════════════════════════════════════ -->
<div class="content-page page-break">
  <div class="section-header">
    <div class="section-number">القسم 7</div>
    <div class="section-title">ملخص التوصيات</div>
    <div class="section-subtitle">Recommendations — تحسينات مقترحة للمرحلة القادمة</div>
    <div class="section-line"></div>
  </div>

  <div class="subsection">
    <div class="subsection-desc">
      بناءً على التحليل المعماري الشامل للمنصة، إليك أهم التوصيات لتحسين الأداء والموثوقية والقابلية للتوسع:
    </div>
  </div>

  <div class="rec-card">
    <div class="rec-card-title">
      <span class="rec-priority priority-high">أولوية عالية</span>
      نظام طوابير للطلبات المتوازية
    </div>
    <div class="rec-card-body">
      حالياً، لا يوجد نظام طوابير رسمي — الطلبات تُعالج بشكل تسلسلي. عند تعدد المستخدمين، قد يتسبب هذا في تجاوز الذاكرة أو انهيار المتصفح. يُنصح بتطبيق BullMQ أو طابور مبني على Redis لإدارة الطلبات بشكل موثوق مع تتبع الحالة وإعادة المحاولة.
    </div>
  </div>

  <div class="rec-card">
    <div class="rec-card-title">
      <span class="rec-priority priority-high">أولوية عالية</span>
      إدارة ذاكرة Chromium محسّنة
    </div>
    <div class="rec-card-body">
      رغم إعادة تشغيل المتصفح عند OOM، إلا أن الحد الأقصى (3 مرات) قد يُستنفد بسرعة تحت الضغط. يُنصح بتطبيق: (1) مراقبة ذاكرة مستمرة لـ Chromium، (2) إغلاق استباقي عند تجاوز 80% من الحد، (3) إعادة تعيين عداد إعادة التشغيل تلقائياً كل ساعة.
    </div>
  </div>

  <div class="rec-card">
    <div class="rec-card-title">
      <span class="rec-priority priority-high">أولوية عالية</span>
      فصل خدمات توليد PDF عن الخادم الرئيسي
    </div>
    <div class="rec-card-body">
      Playwright/Chromium يستهلك ذاكرة كبيرة. يُنصح بفصل خدمة توليد PDF كخدمة مصغرة مستقلة (mini-service) على منفذ منفصل، مما يتيح إدارة الموارد بشكل مستقل وإعادة التشغيل دون التأثير على الخادم الرئيسي.
    </div>
  </div>

  <div class="rec-card">
    <div class="rec-card-title">
      <span class="rec-priority priority-medium">أولوية متوسطة</span>
      تخزين مؤقت لملفات PDF المُولَّدة
    </div>
    <div class="rec-card-body">
      لا يوجد تخزين مؤقت للملفات المُولَّدة — نفس المحتوى يُولَّد من الصفر في كل مرة. يُنصح بتطبيق: (1) hashing للمحتوى + الإعدادات، (2) تخزين مؤقت في الذاكرة أو ملفات، (3) إعادة استخدام PDF المُولَّد مسبقاً عند تطابق الـ hash.
    </div>
  </div>

  <div class="rec-card">
    <div class="rec-card-title">
      <span class="rec-priority priority-medium">أولوية متوسطة</span>
      مراقبة وصحة الخدمة (Health Monitoring)
    </div>
    <div class="rec-card-body">
      يوجد <code>/api/health</code> و <code>/api/pdf/renderer-status</code> لكن بدون مراقبة مستمرة. يُنصح بتطبيق: (1) فحص صحة دوري لـ Chromium، (2) تنبيهات عند تجاوز استخدام الذاكرة 80%، (3) مقاييس Prometheus لزمن التوليد وحجم الطلبات.
    </div>
  </div>

  <div class="rec-card">
    <div class="rec-card-title">
      <span class="rec-priority priority-medium">أولوية متوسطة</span>
      دعم أفضل لـ BiDi في المحتوى المختلط
    </div>
    <div class="rec-card-body">
      رغم دعم RTL الأساسي، المحتوى المختلط (عربي + إنجليزي + كود) لا يزال يواجه مشاكل عرض. يُنصح بتحسين: (1) عزل أفضل للكتل البرمجية بـ <code>unicode-bidi: isolate</code>، (2) اتجاه تلقائي للفقرات حسب الحرف الأول، (3) اختبارات بصرية للمحتوى المختلط.
    </div>
  </div>

  <div class="rec-card">
    <div class="rec-card-title">
      <span class="rec-priority priority-low">أولوية منخفضة</span>
      ترحيل قاعدة البيانات إلى PostgreSQL
    </div>
    <div class="rec-card-body">
      تم الترحيل من SQLite إلى PostgreSQL — يدعم التزامن العالي، ACID كامل مع MVCC، Connection Pooling، JSONB، والبحث النصي الكامل. الاتصال عبر <code>DATABASE_URL</code> مع <code>prisma migrate deploy</code> للإنتاج.
    </div>
  </div>

  <div class="rec-card">
    <div class="rec-card-title">
      <span class="rec-priority priority-low">أولوية منخفضة</span>
      اختبارات آلية لخط أنابيب PDF
    </div>
    <div class="rec-card-body">
      لا توجد اختبارات آلية لخط أنابيب توليد PDF. يُنصح بتطوير: (1) اختبارات وحدة لمحلل Markdown، (2) اختبارات تكامل لكل مرحلة في الأنابيب، (3) اختبارات بصرية (snapshot testing) لمخرجات PDF للتأكد من عدم الانحدار.
    </div>
  </div>

  <div class="section-end"></div>

  <div style="text-align:center; padding: 24px 0; color: ${mutedText}; font-size: 11px;">
    <div style="font-size: 16px; margin-bottom: 8px;">◆</div>
    <div style="font-weight:700; color: ${primaryColor}; font-size: 14px;">DeltaAI — التقرير التقني المعماري</div>
    <div>بعقل هادي | v1.0 | مارس 2026</div>
    <div style="margin-top: 4px;">تم إنشاء هذا التقرير تلقائياً عبر خط أنابيب Playwright PDF</div>
  </div>
</div>

</body>
</html>`;
}

// ─── API Route Handler ────────────────────────────────────────────────────

export async function GET() {
  try {
    console.log('[Architecture Report] Generating PDF report...');

    // Step 1: Generate the HTML
    const html = generateArchitectureReportHTML();
    console.log('[Architecture Report] HTML generated, length:', html.length);

    // Step 2: Render via Playwright (dynamic import to avoid loading at compile time)
    const { renderHTMLToPDF } = await import('@/lib/playwright-renderer');

    const result = await renderHTMLToPDF({
      html,
      title: 'DeltaAI — التقرير التقني المعماري',
      language: 'ar',
      pageSize: 'A4',
      margins: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
    });

    if (!result.success || !result.pdfBuffer) {
      console.error('[Architecture Report] Playwright rendering failed:', result.error);

      // Fallback: Save as HTML
      const downloadDir = join(process.cwd(), 'download');
      if (!existsSync(downloadDir)) {
        mkdirSync(downloadDir, { recursive: true });
      }
      const outputPath = join(downloadDir, `architecture-report-${randomUUID()}.html`);
      writeFileSync(outputPath, html);

      return NextResponse.json({
        success: false,
        error: `PDF rendering failed: ${result.error}. HTML fallback saved.`,
        fallbackPath: outputPath,
      }, { status: 500 });
    }

    // Step 3: Save PDF file
    const downloadDir = join(process.cwd(), 'download');
    if (!existsSync(downloadDir)) {
      mkdirSync(downloadDir, { recursive: true });
    }

    const filename = `architecture-report-${randomUUID()}.pdf`;
    const outputPath = join(downloadDir, filename);
    writeFileSync(outputPath, result.pdfBuffer);

    console.log(`[Architecture Report] PDF generated successfully: ${filename} (${result.pdfBuffer.length} bytes, ${result.duration}ms)`);

    return NextResponse.json({
      success: true,
      filename,
      filePath: outputPath,
      size: result.pdfBuffer.length,
      duration: result.duration,
      downloadUrl: `/api/pdf/serve/${filename}`,
    });
  } catch (error) {
    console.error('[Architecture Report] Error:', error);
    return NextResponse.json(
      { success: false, error: 'حدث خطأ أثناء إنشاء التقرير' },
      { status: 500 },
    );
  }
}
