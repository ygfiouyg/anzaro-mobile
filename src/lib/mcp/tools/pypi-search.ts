/**
 * MCP Tool: PyPI Search
 * تكامل حقيقي مع PyPI XMLRPC API — بحث في Python packages.
 */
import type { MCPTool } from "../types";

export const pypiSearchTool: MCPTool = {
  name: "pypi_search",
  description: "بحث في PyPI Python packages (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'pypi search' أو 'python packages'.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "كلمة البحث" },
      count: { type: "number", description: "عدد النتائج (افتراضي: 10، أقصى: 50)", default: 10 },
    },
    required: ["query"],
  },
  async execute(params) {
    const query = String(params.query || "").trim();
    const count = Math.min(50, Math.max(1, Number(params.count) || 10));

    if (!query) return { success: false, error: "query مطلوبة" };

    try {
      // PyPI مفيهوش search API رسمي، فبنستخدم XMLRPC للـ search
      const body = `<?xml version="1.0"?>
<methodCall>
  <methodName>search</methodName>
  <params>
    <param>
      <value>
        <struct>
          <member>
            <name>name</name>
            <value><array><data><value><string>${escapeXml(query)}</string></value></data></array></value>
          </member>
          <member>
            <name>summary</name>
            <value><array><data><value><string>${escapeXml(query)}</string></value></data></array></value>
          </member>
        </struct>
      </value>
    </param>
    <param>
      <value><string>name</string></value>
    </param>
    <param>
      <value><boolean>0</boolean></value>
    </param>
  </params>
</methodCall>`;

      const res = await fetch("https://pypi.org/pypi", {
        method: "POST",
        headers: {
          "Content-Type": "text/xml",
          "User-Agent": "DeltaAI-MCP/1.0",
        },
        body,
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) return { success: false, error: `PyPI API error ${res.status}` };

      const xml = await res.text();

      // parse XML response (simple regex)
      const items: any[] = [];
      const itemRegex = /<struct>([\s\S]*?)<\/struct>/g;
      let match: RegExpExecArray | null;
      let countFound = 0;

      while ((match = itemRegex.exec(xml)) !== null && countFound < count) {
        const struct = match[1];
        const nameMatch = struct.match(/<name>name<\/name>\s*<value>\s*<string>([^<]*)<\/string>/);
        const summaryMatch = struct.match(/<name>summary<\/name>\s*<value>\s*<string>([^<]*)<\/string>/);
        const versionMatch = struct.match(/<name>version<\/name>\s*<value>\s*<string>([^<]*)<\/string>/);

        if (nameMatch) {
          items.push({
            name: unescapeXml(nameMatch[1]),
            summary: summaryMatch ? unescapeXml(summaryMatch[1]) : "",
            version: versionMatch ? unescapeXml(versionMatch[1]) : "",
            url: `https://pypi.org/project/${nameMatch[1]}/`,
          });
          countFound++;
        }
      }

      return {
        success: true,
        data: {
          query,
          total: items.length,
          packages: items,
          source: "pypi.org",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function unescapeXml(text: string): string {
  return text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
