/**
 * Telegram Bot — بـ Telegraf
 * ============================
 * بيرد على الرسائل النصية + الصور بـ GLM-5.2
 */

import { Telegraf, Context } from 'telegraf';
import { getZAIClient } from '@/lib/zai-client';

let bot: Telegraf | null = null;
let botStatus: 'stopped' | 'running' = 'stopped';
let botInfo: { username?: string; first_name?: string } = {};

/**
 * بدء الـ Telegram bot
 */
export async function startTelegramBot(token: string): Promise<{ success: boolean; username?: string; error?: string }> {
  if (!token) {
    return { success: false, error: 'Bot token مطلوب. احصل عليه من @BotFather' };
  }

  if (bot && botStatus === 'running') {
    return { success: true, username: botInfo.username };
  }

  try {
    bot = new Telegraf(token);

    // Get bot info
    const me = await bot.telegram.getMe();
    botInfo = { username: me.username, first_name: me.first_name };

    // /start
    bot.start((ctx) => {
      ctx.reply('👋 أهلاً بك في DeltaAI Bot! أنا مساعدك الذكي. ابعث أي سؤال وأنا هرد عليك.');
    });

    // /help
    bot.help((ctx) => {
      ctx.reply('📋 الأوامر المتاحة:\n/start - ترحيب\n/help - مساعدة\n\nاسأل أي سؤال وأنا هرد عليك بـ GLM-5.2\nتقدر تبعت صورة وأنا أحللها لك بـ GLM-4V');
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
            { role: 'system', content: 'أنت DeltaAI Bot على Telegram. رد بالعربية الفصحى أو العامية حسب رسالة المستخدم. كن مختصراً ومفيداً.' },
            { role: 'user', content: text },
          ],
          max_tokens: 2048,
          temperature: 0.7,
        });

        const reply = completion?.choices?.[0]?.message?.content || 'عذراً، لم أتمكن من الرد.';
        // Telegram limit: 4096 chars per message
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

    // Handle photos (vision)
    bot.on('photo', async (ctx: Context) => {
      try {
        const photos = (ctx.message as any).photo;
        const largest = photos[photos.length - 1];
        const fileLink = await bot!.telegram.getFileLink(largest.file_id);
        const caption = (ctx.message as any).caption || 'حلل الصورة دي';

        await ctx.sendChatAction('typing');

        const zai = await getZAIClient();
        const completion = await zai.chat.completions.create({
          model: 'glm-4v',
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: caption },
              { type: 'image_url', image_url: { url: fileLink.toString() } },
            ],
          }],
          max_tokens: 2048,
        });

        const reply = completion?.choices?.[0]?.message?.content || 'مقدرش أحلل الصورة دي.';
        await ctx.reply(reply);
      } catch (e: any) {
        await ctx.reply('❌ خطأ في تحليل الصورة: ' + e.message);
      }
    });

    bot.launch();
    botStatus = 'running';

    // Enable graceful stop
    process.once('SIGINT', () => bot?.stop('SIGINT'));
    process.once('SIGTERM', () => bot?.stop('SIGTERM'));

    return { success: true, username: botInfo.username };
  } catch (e: any) {
    bot = null;
    botStatus = 'stopped';
    return { success: false, error: e.message };
  }
}

/**
 * إيقاف الـ bot
 */
export function stopTelegramBot() {
  if (bot) {
    try {
      bot.stop('Stopped by user');
    } catch {}
    bot = null;
    botStatus = 'stopped';
  }
}

/**
 * Auto-start the bot if TELEGRAM_BOT_TOKEN is set.
 * Called when the app starts. Safe to call multiple times.
 */
export async function autoStartTelegramBot(): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.log('[Telegram] No TELEGRAM_BOT_TOKEN set — skipping auto-start');
    return;
  }

  if (botStatus === 'running') {
    console.log('[Telegram] Bot already running');
    return;
  }

  console.log('[Telegram] Auto-starting bot with token from env...');
  const result = await startTelegramBot(token);
  if (result.success) {
    console.log(`[Telegram] Bot started successfully: @${result.username}`);
  } else {
    console.error(`[Telegram] Auto-start failed: ${result.error}`);
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
