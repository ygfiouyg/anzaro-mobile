/**
 * MCP Tool: QR Code Generator
 * تكامل حقيقي مع QRServer.com API (مجاني تماماً، بدون API key).
 * بيولّد QR code لأي نص/رابط.
 */
import type { MCPTool } from "../types";

export const qrGenerateTool: MCPTool = {
  name: "qr_generate",
  description: "ولّد QR code لأي نص/رابط (API حقيقي، مجاني). استخدمها لما المستخدم يقول 'QR' أو 'باركود' أو 'qr code'.",
  parameters: {
    type: "object",
    properties: {
      data: { type: "string", description: "النص/الرابط للـ QR code" },
      size: { type: "string", description: "الحجم بصيغة WxH (افتراضي: 300x300)", default: "300x300" },
      color: { type: "string", description: "لون QR بصيغة hex بدون # (افتراضي: 000000)", default: "000000" },
      bgcolor: { type: "string", description: "لون الخلفية بصيغة hex بدون # (افتراضي: ffffff)", default: "ffffff" },
      format: { type: "string", description: "الصيغة: png, svg, gif (افتراضي: png)", default: "png" },
    },
    required: ["data"],
  },
  async execute(params) {
    const data = String(params.data || "").trim();
    const size = String(params.size || "300x300").trim();
    const color = String(params.color || "000000").trim();
    const bgcolor = String(params.bgcolor || "ffffff").trim();
    const format = String(params.format || "png").toLowerCase().trim();

    if (!data) return { success: false, error: "data مطلوبة" };

    // تحقق من صحة المدخلات
    if (!/^\d+x\d+$/.test(size)) {
      return { success: false, error: "size لازم يكون بصيغة WxH (مثلاً: 300x300)" };
    }
    if (!/^[0-9a-fA-F]{6}$/.test(color)) {
      return { success: false, error: "color لازم hex 6 خانات بدون # (مثلاً: 000000)" };
    }
    if (!/^[0-9a-fA-F]{6}$/.test(bgcolor)) {
      return { success: false, error: "bgcolor لازم hex 6 خانات بدون # (مثلاً: ffffff)" };
    }

    try {
      const validFormats = ["png", "svg", "gif"];
      const selectedFormat = validFormats.includes(format) ? format : "png";

      // QRServer.com API
      const params2 = new URLSearchParams();
      params2.set("size", size);
      params2.set("color", `0x${color}`);
      params2.set("bgcolor", `0x${bgcolor}`);
      params2.set("data", data);
      params2.set("format", selectedFormat);
      params2.set("margin", "10");

      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?${params2.toString()}`;

      // نتحقق إن الـ QR اتولّد بنجاح
      const res = await fetch(qrUrl, {
        method: "HEAD",
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        return { success: false, error: `QR API error ${res.status}` };
      }

      const contentLength = res.headers.get("content-length");
      const contentType = res.headers.get("content-type") || "";

      return {
        success: true,
        data: {
          qr_url: qrUrl,
          data_encoded: data.slice(0, 100),
          size,
          color: `#${color}`,
          bgcolor: `#${bgcolor}`,
          format: selectedFormat,
          content_type: contentType,
          content_length: contentLength ? parseInt(contentLength) : null,
          note: "الـ QR URL جاهز للاستخدام في img أو تنزيل مباشر",
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
