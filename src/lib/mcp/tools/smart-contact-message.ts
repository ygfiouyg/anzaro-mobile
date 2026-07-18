/**
 * MCP Tool: Smart Contact Message
 * ===============================
 * سيناريو حقيقي: "ابعت لبابا صباح الخير"
 * 
 * الخطوات:
 * 1. ابحث عن "بابا" في قاعدة جهات الاتصال المحلية (DB)
 * 2. لو مش موجود، اسأل المستخدم يحفظه
 * 3. ولّد رسالة "صباح الخير يا بابا" بالـ AI
 * 4. ابعتها على القناة المتاحة (واتساب/تليجرام)
 * 
 * ملاحظة: WhatsApp Cloud API مش بيوفر قراءة جهات الاتصال.
 * الحل: قائمة محلية في UserMemory بـ category="contact".
 */
import type { MCPTool } from "../types";
import { callGLMForJSON } from "../json-helper";
import { getAllItems } from "../memory-store";

export const smartContactMessageTool: MCPTool = {
  name: "smart_contact_message",
  description: "ابعت رسالة لأي شخص بالاسم — يبحث عنه في جهات الاتصال، يولّد رسالة شخصية، ويبعثها. استخدمها لما المستخدم يقول: 'ابعت لبابا صباح الخير' أو 'رسالة لأحمد'.",
  parameters: {
    type: "object",
    properties: {
      contactName: { type: "string", description: "اسم الشخص (مثلاً: بابا، أحمد، داليا)" },
      messageIntent: { type: "string", description: "نية الرسالة: صباح الخير، تهنئة، تذكير، اعتذار، استفسار", default: "general" },
      phone: { type: "string", description: "رقم مباشر (اختياري — لو مش محدد، يبحث في الذاكرة)" },
      channel: { type: "string", description: "قناة: whatsapp, telegram, auto (افتراضي: auto)", default: "auto" },
      customMessage: { type: "string", description: "رسالة مخصصة (اختياري)" },
      tone: { type: "string", description: "نبرة: formal, friendly, family (افتراضي: friendly)", default: "friendly" },
    },
    required: ["contactName"],
  },
  async execute(params) {
    const contactName = String(params.contactName || "").trim();
    const messageIntent = String(params.messageIntent || "general");
    const directPhone = String(params.phone || "").trim();
    let channel = String(params.channel || "auto").toLowerCase();
    const customMessage = String(params.customMessage || "").trim();
    const tone = String(params.tone || "friendly");

    if (!contactName) return { success: false, error: "contactName مطلوب" };

    try {
      // ═══ الخطوة 1: ابحث عن جهة الاتصال ═══
      let contact: any = null;

      // لو رقم مباشر موجود
      if (directPhone) {
        contact = { name: contactName, phone: directPhone, source: "direct" };
      } else {
        // ابحث في in-memory store
        try {
          const contacts = getAllItems("contacts");
          for (const c of contacts) {
            const parsed = typeof c.value === "string" ? JSON.parse(c.value) : c.value;
            const savedName = (parsed.name || c.key || "").toLowerCase();
            const searchName = contactName.toLowerCase();
            if (savedName === searchName || savedName.includes(searchName) || searchName.includes(savedName)) {
              contact = {
                name: parsed.name || c.key || contactName,
                phone: parsed.phone || parsed.whatsapp || null,
                telegram: parsed.telegram || null,
                email: parsed.email || null,
                source: "memory",
              };
              break;
            }
          }
        } catch {}

        // لو مش موجود
        if (!contact) {
          return {
            success: false,
            error: `مش لاقي "${contactName}" في جهات الاتصال.\n\nلحفظ جهة اتصال جديدة، استخدم:\nmemory_set بالشكل ده:\nkey: "contact_${contactName}"\nvalue: {"name":"${contactName}","phone":"20xxxxxxxxx"}`,
            hint: `مثال:\n{"name":"memory_set","params":{"key":"contact_بابا","value":"{\\"name\\":\\"بابا\\",\\"phone\\":\\"201234567890\\"}"}}`,
          };
        }
      }

      // ═══ الخطوة 2: ولّد الرسالة بالـ AI ═══
      let message = customMessage;
      if (!message) {
        // الـ AI بيولّد رسالة مخصصة للاسم + النية
        const intentMessages: Record<string, string> = {
          "صباح الخير": "صباح الخير",
          "good_morning": "صباح الخير",
          "تهنئة": "تهنئة",
          "تذكير": "تذكير",
          "اعتذار": "اعتذار",
          "استفسار": "استفسار",
        };

        const intentText = intentMessages[messageIntent] || messageIntent;

        const result = await callGLMForJSON({
          systemPrompt: `ولّد رسالة ${intentText} قصيرة (1-2 سطر) لشخص اسمه "${contact.name}".
النبرة: ${tone === "family" ? "عائلية دافئة" : tone}.
الرسالة لازم تكون طبيعية ومخصصة للاسم ده.
رجّع JSON: {"message":"الرسالة"}`,
          userMessage: `الاسم: ${contact.name}\nالنية: ${intentText}\nالنبرة: ${tone}`,
          maxTokens: 150,
          temperature: 0.7,
        });

        message = result.data?.message || `${intentText} يا ${contact.name}`;
      }

      // ═══ الخطوة 3: حدد القناة ═══
      let selectedChannel = channel;
      if (selectedChannel === "auto") {
        if (contact.phone) selectedChannel = "whatsapp";
        else if (contact.telegram) selectedChannel = "telegram";
        else selectedChannel = "none";
      }

      // ═══ الخطوة 4: ابعت ═══
      let delivery: any = { channel: selectedChannel, status: "not_sent", error: "لا توجد قناة متاحة" };

      if (selectedChannel === "whatsapp" && contact.phone) {
        const waToken = process.env.WHATSAPP_TOKEN;
        const waPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
        if (waToken && waPhoneId) {
          try {
            const res = await fetch(`https://graph.facebook.com/v18.0/${waPhoneId}/messages`, {
              method: "POST",
              headers: { Authorization: `Bearer ${waToken}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                messaging_product: "whatsapp",
                to: contact.phone,
                type: "text",
                text: { body: message },
              }),
              signal: AbortSignal.timeout(15000),
            });
            const resData = await res.json();
            delivery = {
              channel: "whatsapp",
              status: res.ok ? "sent" : "failed",
              message_id: resData.messages?.[0]?.id || null,
              error: res.ok ? null : resData.error?.message || "unknown",
            };
          } catch (e: any) {
            delivery = { channel: "whatsapp", status: "failed", error: e.message };
          }
        } else {
          delivery = { channel: "whatsapp", status: "not_configured", error: "WHATSAPP_TOKEN مش متاح" };
        }
      } else if (selectedChannel === "telegram" && contact.telegram) {
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        if (botToken) {
          try {
            const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ chat_id: contact.telegram, text: message }),
              signal: AbortSignal.timeout(10000),
            });
            delivery = {
              channel: "telegram",
              status: res.ok ? "sent" : "failed",
              error: res.ok ? null : "telegram error",
            };
          } catch (e: any) {
            delivery = { channel: "telegram", status: "failed", error: e.message };
          }
        } else {
          delivery = { channel: "telegram", status: "not_configured", error: "TELEGRAM_BOT_TOKEN مش متاح" };
        }
      }

      return {
        success: true,
        data: {
          scenario: "smart_contact_message",
          contact: {
            name: contact.name,
            phone: contact.phone || null,
            telegram: contact.telegram || null,
            source: contact.source,
          },
          message: {
            intent: messageIntent,
            tone,
            content: message,
            generated_by_ai: !customMessage,
          },
          delivery,
          steps: {
            find_contact: true,
            generate_message: true,
            send: delivery.status === "sent",
          },
          note: delivery.status !== "sent"
            ? `الرسالة جاهزة: "${message}". للإرسال الفعلي، اضبط ${delivery.channel === "whatsapp" ? "WHATSAPP_TOKEN" : "TELEGRAM_BOT_TOKEN"}.`
            : `تم إرسال الرسالة لـ ${contact.name} على ${delivery.channel}.`,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
