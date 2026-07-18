// ─── HTML Safety: Strip HTML from non-file-generation responses ────────
// When a model outputs raw HTML/CSS in a normal chat response (not file generation),
// these functions strip HTML tags and convert them to markdown equivalents.
// This is a POST-PROCESSING safety net — the primary fix is the strong system prompt.

export const HTML_PATTERN_RE = /<style[^>]*>[\s\S]*?<\/style>|<!DOCTYPE[^>]*>|<(?:div|span|section|article|main|header|footer|nav|aside|head|html|body|table|thead|tbody|tfoot|tr|th|td|ul|ol|form|label|input|button|script|meta|link|br|hr)\b[^>]*>/i;

export function containsHtmlTags(text: string): boolean {
  return HTML_PATTERN_RE.test(text) || /class=["'][^"']+["']/i.test(text);
}

export function stripHtmlToMarkdown(text: string): string {
  let result = text;

  // Remove <style> blocks entirely
  result = result.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  // Remove <head> blocks entirely
  result = result.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '');
  // Remove DOCTYPE, html, body tags
  result = result.replace(/<!DOCTYPE[^>]*>/gi, '');
  result = result.replace(/<\/?html[^>]*>/gi, '');
  result = result.replace(/<\/?body[^>]*>/gi, '');

  // Convert headings
  result = result.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n');
  result = result.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n');
  result = result.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n');
  result = result.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n');
  result = result.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '\n##### $1\n');
  result = result.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '\n###### $1\n');

  // Convert formatting
  result = result.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**');
  result = result.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**');
  result = result.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*');
  result = result.replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, '*$1*');

  // Convert list items
  result = result.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '\n- $1');

  // Convert line breaks
  result = result.replace(/<br\s*\/?>/gi, '\n');
  result = result.replace(/<hr\s*\/?>/gi, '\n---\n');

  // Convert paragraphs to double newlines
  result = result.replace(/<p[^>]*>/gi, '\n');
  result = result.replace(/<\/p>/gi, '\n');

  // Convert divs to newlines
  result = result.replace(/<div[^>]*>/gi, '\n');
  result = result.replace(/<\/div>/gi, '');

  // Convert spans (just remove tags, keep content)
  result = result.replace(/<span[^>]*>/gi, '');
  result = result.replace(/<\/span>/gi, '');

  // Convert code blocks
  result = result.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '\n```\n$1\n```\n');
  result = result.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');

  // Remove all remaining HTML tags
  result = result.replace(/<[^>]+>/g, '');

  // Clean up excessive whitespace
  result = result.replace(/\n{3,}/g, '\n\n');
  result = result.trim();

  return result;
}

/**
 * Chunk-level HTML stripping.
 * Strips HTML tags from individual chunks without needing the full response.
 * This is lighter than the full stripHtmlToMarkdown and works on partial content.
 */
export function stripHtmlChunk(chunk: string): string {
  let result = chunk;
  // Remove <style> blocks (even partial)
  result = result.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  // Remove DOCTYPE, html, body, head tags
  result = result.replace(/<!DOCTYPE[^>]*>/gi, '');
  result = result.replace(/<\/?html[^>]*>/gi, '');
  result = result.replace(/<\/?body[^>]*>/gi, '');
  result = result.replace(/<\/?head[^>]*>/gi, '');
  // Convert headings
  result = result.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n');
  result = result.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n');
  result = result.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n');
  result = result.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n');
  // Convert formatting
  result = result.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**');
  result = result.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**');
  result = result.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*');
  result = result.replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, '*$1*');
  // Convert list items
  result = result.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '\n- $1');
  // Convert line breaks
  result = result.replace(/<br\s*\/?>/gi, '\n');
  result = result.replace(/<hr\s*\/?>/gi, '\n---\n');
  // Convert paragraphs
  result = result.replace(/<p[^>]*>/gi, '\n');
  result = result.replace(/<\/p>/gi, '\n');
  // Convert divs
  result = result.replace(/<div[^>]*>/gi, '\n');
  result = result.replace(/<\/div>/gi, '');
  // Convert spans
  result = result.replace(/<span[^>]*>/gi, '');
  result = result.replace(/<\/span>/gi, '');
  // Convert code blocks
  result = result.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '\n```\n$1\n```\n');
  result = result.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');
  // Remove all remaining HTML tags
  result = result.replace(/<[^>]+>/g, '');
  // Clean up excessive whitespace
  result = result.replace(/\n{3,}/g, '\n\n');
  return result;
}

// ─── Markdown to HTML conversion for PDF generation ────────────────────
// When a model outputs plain Markdown instead of HTML for a file generation request,
// this function converts it to a basic HTML document suitable for Playwright rendering.
export function markdownToSimpleHTML(content: string, title: string, language: 'ar' | 'en' = 'ar'): string {
  const isRTL = language === 'ar';
  const dir = isRTL ? 'rtl' : 'ltr';

  // Basic markdown-to-HTML conversion
  let htmlContent = content
    .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');

  // Wrap consecutive <li> items in <ul>
  htmlContent = htmlContent.replace(/((?:<li>[\s\S]*?<\/li>\s*)+)/g, '<ul>$1</ul>');

  return `<!DOCTYPE html>
<html dir="${dir}" lang="${language}">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    @font-face {
      font-family: 'Cairo';
      src: url('file://${process.cwd()}/src/lib/pdf-engine/fonts/Cairo-Regular.ttf') format('truetype');
      font-weight: 400;
    }
    @font-face {
      font-family: 'Cairo';
      src: url('file://${process.cwd()}/src/lib/pdf-engine/fonts/Cairo-Bold.ttf') format('truetype');
      font-weight: 700;
    }
    body {
      font-family: 'Cairo', ${isRTL ? 'Arabic' : ''} sans-serif;
      direction: ${dir};
      text-align: ${isRTL ? 'right' : 'left'};
      padding: 40px;
      line-height: 1.8;
      font-size: 13px;
      color: #1e293b;
      max-width: 800px;
      margin: 0 auto;
    }
    h1 { font-size: 24px; font-weight: 700; margin: 20px 0 10px; color: #0f172a; border-bottom: 2px solid #0f172a; padding-bottom: 8px; }
    h2 { font-size: 18px; font-weight: 700; margin: 16px 0 8px; color: #0f172a; }
    h3 { font-size: 15px; font-weight: 700; margin: 12px 0 6px; color: #1e3a5f; }
    h4 { font-size: 14px; font-weight: 700; margin: 10px 0 6px; color: #475569; }
    ul { margin: 8px 0; padding-${isRTL ? 'right' : 'left'}: 24px; }
    li { margin: 4px 0; }
    strong { font-weight: 700; color: #0f172a; }
    code { background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
    p { margin: 8px 0; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <hr style="margin: 16px 0; border: none; border-top: 2px solid #0f172a;">
  <p>${htmlContent}</p>
  <hr style="margin: 24px 0; border: none; border-top: 1px solid #e2e8f0;">
  <p style="text-align: center; color: #94a3b8; font-size: 10px;">DeltaAI | بعقل هادي</p>
</body>
</html>`;
}
