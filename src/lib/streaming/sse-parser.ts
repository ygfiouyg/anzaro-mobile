/**
 * SSE Streaming Parser
 * ====================
 * A dynamic streaming parser that intercepts the live token stream from GLM
 * and detects custom tags / JSON blocks emitted by the model.
 *
 * Supported custom tags (the model can emit these inline):
 *   <file name="report.pdf" mime="application/pdf">BASE64</file>
 *   <tool name="web.search">{"query":"..."}</tool>
 *   <media type="image">BASE64</media>
 *   <thinking>…reasoning…</thinking>
 *
 * When a tag is detected mid-stream, the parser:
 *   1. Holds the buffer
 *   2. Extracts the structured payload
 *   3. Emits a special "artifact" event to the client
 *   4. Strips the tag from the visible text stream
 */

export interface ParsedArtifact {
  kind: "file" | "media" | "tool" | "thinking";
  name?: string;
  mime?: string;
  data: string;
  meta?: Record<string, unknown>;
}

export interface StreamParserResult {
  visibleText: string;
  artifacts: ParsedArtifact[];
}

/**
 * Parse a complete assistant text and extract structured artifacts.
 * (Used when we have the full text; for live streaming use StreamingTagParser.)
 */
export function parseArtifacts(text: string): StreamParserResult {
  const artifacts: ParsedArtifact[] = [];
  let visible = text;

  // <file name="..." mime="...">BASE64</file>
  visible = visible.replace(
    /<file\s+name="([^"]+)"(?:\s+mime="([^"]+)")?>([\s\S]*?)<\/file>/gi,
    (_m, name, mime, data) => {
      artifacts.push({ kind: "file", name, mime: mime || "application/octet-stream", data: data.trim() });
      return `\n📎 [File: ${name}]\n`;
    },
  );

  // <media type="image|audio|video">BASE64</media>
  visible = visible.replace(
    /<media\s+type="(image|audio|video)"(?:\s+name="([^"]+)")?>([\s\S]*?)<\/media>/gi,
    (_m, type, name, data) => {
      artifacts.push({ kind: "media", name: name || `${type}-asset`, mime: `${type}/*`, data: data.trim() });
      return `\n🎬 [Media: ${name || type}]\n`;
    },
  );

  // <thinking>…</thinking>  (strip from visible)
  visible = visible.replace(
    /<thinking>([\s\S]*?)<\/thinking>/gi,
    (_m, data) => {
      artifacts.push({ kind: "thinking", data: data.trim() });
      return "";
    },
  );

  return { visibleText: visible.trim(), artifacts };
}

/**
 * Stateful streaming parser — feed it tokens one-by-one and it will
 * emit "text" and "artifact" events as soon as they are recognised.
 */
export class StreamingTagParser {
  private buffer = "";
  private inTag = false;
  private tagBuilder = "";

  onText?: (chunk: string) => void;
  onArtifact?: (artifact: ParsedArtifact) => void;

  feed(token: string): void {
    this.buffer += token;

    while (this.buffer.length > 0) {
      if (this.inTag) {
        // look for closing tag
        const closeIdx = this.buffer.indexOf("</");
        if (closeIdx === -1) {
          // keep accumulating
          this.tagBuilder += this.buffer;
          this.buffer = "";
          return;
        }
        // find the end of the closing tag
        const endIdx = this.buffer.indexOf(">", closeIdx);
        if (endIdx === -1) {
          this.tagBuilder += this.buffer.slice(0, closeIdx);
          this.buffer = this.buffer.slice(closeIdx);
          return;
        }
        this.tagBuilder += this.buffer.slice(0, closeIdx);
        const closingTag = this.buffer.slice(closeIdx, endIdx + 1);
        const fullTag = this.tagBuilder + closingTag;
        const parsed = parseArtifacts(fullTag);
        if (parsed.artifacts.length) {
          for (const a of parsed.artifacts) this.onArtifact?.(a);
        } else {
          // not a recognised tag — emit as text
          this.onText?.(fullTag);
        }
        this.tagBuilder = "";
        this.inTag = false;
        this.buffer = this.buffer.slice(endIdx + 1);
      } else {
        const openIdx = this.buffer.indexOf("<");
        if (openIdx === -1) {
          this.onText?.(this.buffer);
          this.buffer = "";
          return;
        }
        if (openIdx > 0) {
          this.onText?.(this.buffer.slice(0, openIdx));
          this.buffer = this.buffer.slice(openIdx);
        }
        // peek: is this one of our known tags?
        const known = /^<(file|media|thinking)\b/i.test(this.buffer);
        if (known) {
          this.inTag = true;
          this.tagBuilder = "";
        } else {
          // not ours — emit the '<' as text and continue
          this.onText?.("<");
          this.buffer = this.buffer.slice(1);
        }
      }
    }
  }

  /** Flush any remaining buffer at end of stream. */
  flush(): void {
    if (this.tagBuilder) this.onText?.(this.tagBuilder);
    if (this.buffer) this.onText?.(this.buffer);
    this.tagBuilder = "";
    this.buffer = "";
  }
}
