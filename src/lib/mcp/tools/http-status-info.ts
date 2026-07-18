/**
 * MCP Tool: HTTP Status Info
 * معلومات أي HTTP status code (محلي).
 */
import type { MCPTool } from "../types";

export const httpStatusInfoTool: MCPTool = {
  name: "http_status_info",
  description: "معلومات أي HTTP status code (محلي). استخدمها لما المستخدم يقول 'http status' أو 'كود 404'.",
  parameters: {
    type: "object",
    properties: {
      code: { type: "number", description: "رقم الـ status code" },
    },
    required: ["code"],
  },
  async execute(params) {
    const code = Number(params.code);
    if (isNaN(code)) return { success: false, error: "code لازم رقم" };
    if (code < 100 || code > 599) return { success: false, error: "كود لازم بين 100 و 599" };

    try {
      const info = getStatusInfo(code);
      return {
        success: true,
        data: {
          code,
          ...info,
          cat_image: `https://http.cat/${code}.jpg`,
          dog_image: `https://httpstatusdogs.com/img/${code}.jpg`,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};

function getStatusInfo(code: number): any {
  const statusCodes: Record<number, any> = {
    // 1xx Informational
    100: { name: "Continue", category: "Informational", category_ar: "معلوماتي", description: "الخادم قبل الـ request headers ويستني body" },
    101: { name: "Switching Protocols", category: "Informational", category_ar: "معلوماتي", description: "الخادم بيوافق على تبديل البروتوكول" },
    102: { name: "Processing", category: "Informational", category_ar: "معلوماتي", description: "الخادم بمعالج الـ request" },
    103: { name: "Early Hints", category: "Informational", category_ar: "معلوماتي", description: "تلميحات مبكرة للمتصفح" },

    // 2xx Success
    200: { name: "OK", category: "Success", category_ar: "نجاح", description: "الـ request نجح" },
    201: { name: "Created", category: "Success", category_ar: "نجاح", description: "تم إنشاء مورد جديد" },
    202: { name: "Accepted", category: "Success", category_ar: "نجاح", description: "الـ request اتقبل للمعالجة" },
    204: { name: "No Content", category: "Success", category_ar: "نجاح", description: "نجح بس مفيش محتوى" },
    206: { name: "Partial Content", category: "Success", category_ar: "نجاح", description: "جزء من المحتوى" },

    // 3xx Redirection
    301: { name: "Moved Permanently", category: "Redirection", category_ar: "إعادة توجيه", description: "المورد انتقل بشكل دائم" },
    302: { name: "Found", category: "Redirection", category_ar: "إعادة توجيه", description: "إعادة توجيه مؤقتة" },
    304: { name: "Not Modified", category: "Redirection", category_ar: "إعادة توجيه", description: "المورد مش متغير — استخدم النسخة المخزنة" },
    307: { name: "Temporary Redirect", category: "Redirection", category_ar: "إعادة توجيه", description: "إعادة توجيه مؤقتة مع نفس الـ method" },
    308: { name: "Permanent Redirect", category: "Redirection", category_ar: "إعادة توجيه", description: "إعادة توجيه دائمة مع نفس الـ method" },

    // 4xx Client Error
    400: { name: "Bad Request", category: "Client Error", category_ar: "خطأ عميل", description: "الـ request مش صالح" },
    401: { name: "Unauthorized", category: "Client Error", category_ar: "خطأ عميل", description: "محتاج مصادقة" },
    402: { name: "Payment Required", category: "Client Error", category_ar: "خطأ عميل", description: "محتاج دفع" },
    403: { name: "Forbidden", category: "Client Error", category_ar: "خطأ عميل", description: "ممنوع — مفيش صلاحية" },
    404: { name: "Not Found", category: "Client Error", category_ar: "خطأ عميل", description: "المورد مش موجود" },
    405: { name: "Method Not Allowed", category: "Client Error", category_ar: "خطأ عميل", description: "HTTP method مش مسموح" },
    408: { name: "Request Timeout", category: "Client Error", category_ar: "خطأ عميل", description: "انتهت مهلة الـ request" },
    409: { name: "Conflict", category: "Client Error", category_ar: "خطأ عميل", description: "تعارض مع الحالة الحالية" },
    410: { name: "Gone", category: "Client Error", category_ar: "خطأ عميل", description: "المورد مش متاح بعد كده" },
    418: { name: "I'm a Teapot", category: "Client Error", category_ar: "خطأ عميل", description: "أنا إبريق شاي ☕ (April Fools joke)" },
    422: { name: "Unprocessable Entity", category: "Client Error", category_ar: "خطأ عميل", description: "بيانات مش صالحة للمعالجة" },
    429: { name: "Too Many Requests", category: "Client Error", category_ar: "خطأ عميل", description: "Rate limit — طلبات كتير" },

    // 5xx Server Error
    500: { name: "Internal Server Error", category: "Server Error", category_ar: "خطأ خادم", description: "خطأ داخلي في الخادم" },
    501: { name: "Not Implemented", category: "Server Error", category_ar: "خطأ خادم", description: "الخادم مش بيدعم الـ method" },
    502: { name: "Bad Gateway", category: "Server Error", category_ar: "خطأ خادم", description: "استجابة غير صالحة من upstream" },
    503: { name: "Service Unavailable", category: "Server Error", category_ar: "خطأ خادم", description: "الخدمة مش متاحة" },
    504: { name: "Gateway Timeout", category: "Server Error", category_ar: "خطأ خادم", description: "انتهت مهلة الـ gateway" },
    511: { name: "Network Authentication Required", category: "Server Error", category_ar: "خطأ خادم", description: "محتاج مصادقة شبكة" },
  };

  if (statusCodes[code]) {
    return statusCodes[code];
  }

  // generic by range
  if (code >= 100 && code < 200) {
    return { name: "Informational", category: "Informational", category_ar: "معلوماتي", description: "كود معلوماتي" };
  }
  if (code >= 200 && code < 300) {
    return { name: "Success", category: "Success", category_ar: "نجاح", description: "كود نجاح" };
  }
  if (code >= 300 && code < 400) {
    return { name: "Redirection", category: "Redirection", category_ar: "إعادة توجيه", description: "كود إعادة توجيه" };
  }
  if (code >= 400 && code < 500) {
    return { name: "Client Error", category: "Client Error", category_ar: "خطأ عميل", description: "خطأ من العميل" };
  }
  return { name: "Server Error", category: "Server Error", category_ar: "خطأ خادم", description: "خطأ من الخادم" };
}
