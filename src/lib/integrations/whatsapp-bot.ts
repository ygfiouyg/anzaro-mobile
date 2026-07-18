/**
 * WhatsApp Bot — عبر WhatsApp Business Cloud API (رسمي)
 * ======================================================
 * بيتطلب:
 * - WHATSAPP_TOKEN (من Meta Business)
 * - WHATSAPP_PHONE_NUMBER_ID (من Meta Business)
 *
 * ده الـ API الرسمي من Meta — مش بيـ flag من HuggingFace
 * المستخدم يقدر يبعت ويستقبل رسائل عبر webhook
 */

import { getZAIClient } from '@/lib/zai-client';

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || '';
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
const WHATSAPP_API_BASE = 'https://graph.facebook.com/v18.0';

export interface WhatsAppWebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: string;
        metadata: { display_phone_number: string; phone_number_id: string };
        contacts: Array<{ profile: { name: string }; wa_id: string }>;
        messages: Array<{
          from: string;
          id: string;
          text?: { body: string };
          type: string;
          timestamp: string;
        }>;
      };
      field: string;
    }>;
  }>;
}

/**
 * إرسال رسالة WhatsApp نصية
 */
export async function sendWhatsAppMessage(to: string, text: string): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
}> {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    return {
      success: false,
      error: 'WHATSAPP_TOKEN و WHATSAPP_PHONE_NUMBER_ID مطلوبين. احصل عليهم من Meta Business.',
    };
  }

  try {
    const res = await fetch(`${WHATSAPP_API_BASE}/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return { success: false, error: `WhatsApp API error ${res.status}: ${err.slice(0, 200)}` };
    }

    const data = await res.json();
    return {
      success: true,
      messageId: data?.messages?.[0]?.id,
    };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

/**
 * معالجة رسالة واردة من webhook
 * بيرد بـ GLM-5.2 تلقائياً
 */
export async function handleIncomingWhatsAppMessage(payload: WhatsAppWebhookPayload): Promise<void> {
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const messages = change.value?.messages || [];
      const contacts = change.value?.contacts || [];

      for (const msg of messages) {
        if (msg.type !== 'text' || !msg.text?.body) continue;

        const text = msg.text.body;
        const from = msg.from;
        const contactName = contacts.find((c) => c.wa_id === from)?.profile?.name || from;

        try {
          const zai = await getZAIClient();
          const completion = await zai.chat.completions.create({
            model: 'glm-5.2',
            messages: [
              {
                role: 'system',
                content: `أنت DeltaAI على WhatsApp. المستخدم اسمه ${contactName}. رد بالعربية الفصحى أو العامية حسب رسالته. كن مختصراً ومفيداً.`,
              },
              { role: 'user', content: text },
            ],
            max_tokens: 1024,
            temperature: 0.7,
          });

          const reply = completion?.choices?.[0]?.message?.content || 'عذراً، لم أتمكن من الرد الآن.';
          await sendWhatsAppMessage(from, reply);
        } catch (e: any) {
          await sendWhatsAppMessage(from, `❌ حدث خطأ: ${e.message}`);
        }
      }
    }
  }
}

/**
 * حالة الـ WhatsApp bot
 */
export function getWhatsAppStatus() {
  return {
    status: WHATSAPP_TOKEN && WHATSAPP_PHONE_NUMBER_ID ? 'configured' : 'not_configured',
    hasToken: !!WHATSAPP_TOKEN,
    hasPhoneNumberId: !!WHATSAPP_PHONE_NUMBER_ID,
    instructions: !WHATSAPP_TOKEN ? [
      '1. ادخل business.facebook.com',
      '2. اعمل WhatsApp Business Account',
      '3. من Meta Business Manager → WhatsApp Manager → API Setup',
      '4. انسخ Access Token و Phone Number ID',
      '5. ضيفهم في HF Space Secrets كـ WHATSAPP_TOKEN و WHATSAPP_PHONE_NUMBER_ID',
      '6. ضبط webhook URL على /api/whatsapp/webhook',
    ] : [],
  };
}
