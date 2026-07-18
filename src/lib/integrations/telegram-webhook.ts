/**
 * Telegram Bot — Webhook Mode
 * ===========================
 * بدل long polling (اللي بياخد process منفصل)، نستخدم webhook.
 * تليجرام بيبعت POST لـ /api/telegram/webhook كل ما فيه رسالة.
 * ده بيشتغل جوه Next.js process نفسه — مفيش process منفصل.
 */

import { Telegraf, Context } from 'telegraf';
import { getZAIClient } from '@/lib/zai-client';

let bot: Telegraf | null = null;
let botStatus: 'stopped' | 'running' = 'stopped';
let botInfo: { username?: string; first_name?: string } = {};

/**
 * بدء الـ Telegram bot في وضع webhook
 * - ينشئ Telegraf instance
 * - يـ set webhook URL على تليجرام
 * - يـ return الـ bot instance عشان نستخدمه في الـ webhook route
 */
export async function startTelegramBotWebhook(token: string, webhookUrl: string): Promise<{
  success: boolean;
  username?: string;
  error?: string;
}> {
  if (!token) {
    return { success: false, error: 'Bot token مطلوب' };
  }

  try {
    bot = new Telegraf(token);

    // Get bot info
    const me = await bot.telegram.getMe();
    botInfo = { username: me.username, first_name: me.first_name };

    // /start
    bot.start((ctx) => {
      ctx.reply('👋 أهلاً بك في DeltaAI Bot! ابعث أي سؤال وأنا هرد عليك.');
    });

    // /help
    bot.help((ctx) => {
      ctx.reply('📋 الأوامر:\n/start - ترحيب\n/help - مساعدة\n\nاسأل أي سؤال بـ GLM-5.2\nتبعت صورة وأنا أحللها بـ GLM-4V');
    });

    // Handle text messages
    bot.on('text', async (ctx: Context) => {
      const text = (ctx.message as any).text;
      if (text.startsWith('/')) return;

      try {
        await ctx.sendChatAction('typing');

        const zai = await getZAIClient();
        const completion = await zai.chat.completions.create({
          model: 'glm-5.2',
          messages: [
            { role: 'system', content: 'أنت DeltaAI Bot على Telegram. رد بالعربية. كن مختصراً ومفيداً.' },
            { role: 'user', content: text },
          ],
          max_tokens: 2048,
          temperature: 0.7,
        });

        const reply = completion?.choices?.[0]?.message?.content || 'عذراً، لم أتمكن من الرد.';
        if (reply.length > 4000) {
          for (let i = 0; i < reply.length; i += 4000) {
            await ctx.reply(reply.slice(i, i + 4000));
          }
        } else {
          await ctx.reply(reply);
        }
      } catch (e: any) {
        await ctx.reply('❌ حدث خطأ: ' + e.message);
      }
    });

    // Handle photos
    bot.on('photo', async (ctx: Context) => {
      try {
        const photos = (ctx.message as any).photo;
        const largest = photos[photos.length - 1];
        const fileLink = await bot.telegram.getFileLink(largest.file_id);

        await ctx.sendChatAction('typing');

        const zai = await getZAIClient();
        const completion = await zai.chat.completions.create({
          model: 'glm-4v',
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: 'وصف الصورة بالعربية.' },
                { type: 'image_url', image_url: { url: fileLink.toString() } },
              ],
            },
          ],
        } as any);

        const reply = completion?.choices?.[0]?.message?.content || 'لم أتمكن من تحليل الصورة.';
        await ctx.reply(reply);
      } catch (e: any) {
        await ctx.reply('❌ خطأ في تحليل الصورة: ' + e.message);
      }
    });

    // Set webhook
    const fullWebhookUrl = `${webhookUrl}/api/telegram/webhook`;
    await bot.telegram.setWebhook(fullWebhookUrl);
    console.log(`[Telegram] Webhook set to: ${fullWebhookUrl}`);

    botStatus = 'running';

    return { success: true, username: botInfo.username };
  } catch (e: any) {
    bot = null;
    botStatus = 'stopped';
    return { success: false, error: e.message };
  }
}

/**
 * Process incoming webhook update from Telegram.
 * Called by /api/telegram/webhook route.
 */
export async function processTelegramUpdate(update: any): Promise<void> {
  if (!bot) {
    console.error('[Telegram] Bot not initialized — cannot process update');
    return;
  }
  try {
    await bot.handleUpdate(update);
  } catch (e: any) {
    console.error('[Telegram] Error processing update:', e.message);
  }
}

/**
 * حالة الـ bot
 */
export function getTelegramStatus() {
  return {
    status: botStatus,
    username: botInfo.username,
  };
}

/**
 * Auto-setup webhook on startup if TELEGRAM_BOT_TOKEN is set.
 * Called from instrumentation.ts or start.sh.
 */
export async function autoSetupTelegramWebhook(): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.log('[Telegram] No TELEGRAM_BOT_TOKEN — skipping');
    return;
  }

  // Determine the public URL for webhook
  const publicUrl = process.env.ANZARO_PUBLIC_URL || process.env.DELTAAI_PUBLIC_URL ||
    process.env.SPACE_URL ||
    'https://kopabdo-delta-ai-v2.hf.space';

  console.log(`[Telegram] Auto-setting up webhook: ${publicUrl}/api/telegram/webhook`);
  const result = await startTelegramBotWebhook(token, publicUrl);
  if (result.success) {
    console.log(`[Telegram] ✅ Webhook bot ready: @${result.username}`);
  } else {
    console.error(`[Telegram] ❌ Setup failed: ${result.error}`);
  }
}
