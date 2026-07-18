/**
 * MCP Tool: User-Agent Parser
 * بيحلّل أي User-Agent string ويرجّع browser, OS, device.
 * محلي — بدون API خارجي.
 */
import type { MCPTool } from "../types";

export const userAgentParserTool: MCPTool = {
  name: "user_agent_parser",
  description: "حلّل User-Agent string (browser, OS, device) (محلي). استخدمها لما المستخدم يقول 'user agent' أو 'browser info' أو 'UA'.",
  parameters: {
    type: "object",
    properties: {
      ua: { type: "string", description: "الـ User-Agent string" },
    },
    required: ["ua"],
  },
  async execute(params) {
    const ua = String(params.ua || "").trim();
    if (!ua) return { success: false, error: "ua مطلوب" };
    if (ua.length > 1000) return { success: false, error: "UA طويل جداً" };

    try {
      const parsed = parseUserAgent(ua);

      return {
        success: true,
        data: {
          original_ua: ua.slice(0, 200),
          ...parsed,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};

function parseUserAgent(ua: string) {
  const lower = ua.toLowerCase();

  // Browser detection
  let browser = "Unknown";
  let browserVersion = "";

  if (/edge\/(\d+)/.test(lower) || /edg\/(\d+)/.test(lower)) {
    browser = "Microsoft Edge";
    browserVersion = (lower.match(/edg(?:e|a|ios)?\/(\d+[\d.]*)/) || [])[1] || "";
  } else if (/opr\/(\d+)/.test(lower) || /opera/.test(lower)) {
    browser = "Opera";
    browserVersion = (lower.match(/opr\/(\d+[\d.]*)/) || lower.match(/opera\/(\d+[\d.]*)/) || [])[1] || "";
  } else if (/samsungbrowser\/(\d+)/.test(lower)) {
    browser = "Samsung Internet";
    browserVersion = (lower.match(/samsungbrowser\/(\d+[\d.]*)/) || [])[1] || "";
  } else if (/firefox\/(\d+)/.test(lower) && !/seamonkey/.test(lower)) {
    browser = "Firefox";
    browserVersion = (lower.match(/firefox\/(\d+[\d.]*)/) || [])[1] || "";
  } else if (/chrome\/(\d+)/.test(lower) && !/chromium/.test(lower)) {
    browser = "Chrome";
    browserVersion = (lower.match(/chrome\/(\d+[\d.]*)/) || [])[1] || "";
  } else if (/safari/.test(lower) && !/chrome/.test(lower)) {
    browser = "Safari";
    browserVersion = (lower.match(/version\/(\d+[\d.]*)/) || [])[1] || "";
  } else if (/msie|trident/.test(lower)) {
    browser = "Internet Explorer";
    browserVersion = (lower.match(/(?:msie |rv:)(\d+[\d.]*)/) || [])[1] || "";
  }

  // Engine detection
  let engine = "Unknown";
  let engineVersion = "";
  if (/gecko\/\d/.test(lower) && !/like gecko/.test(lower)) {
    engine = "Gecko";
    engineVersion = (lower.match(/rv:(\d+[\d.]*)/) || [])[1] || "";
  } else if (/applewebkit/.test(lower)) {
    engine = "WebKit";
    if (/blink/.test(lower)) {
      engine = "Blink";
    }
    engineVersion = (lower.match(/applewebkit\/(\d+[\d.]*)/) || [])[1] || "";
  } else if (/trident/.test(lower)) {
    engine = "Trident";
    engineVersion = (lower.match(/trident\/(\d+[\d.]*)/) || [])[1] || "";
  }

  // OS detection
  let os = "Unknown";
  let osVersion = "";

  if (/windows nt 10/.test(lower)) {
    os = "Windows";
    osVersion = "10/11";
  } else if (/windows nt 6\.3/.test(lower)) {
    os = "Windows";
    osVersion = "8.1";
  } else if (/windows nt 6\.2/.test(lower)) {
    os = "Windows";
    osVersion = "8";
  } else if (/windows nt 6\.1/.test(lower)) {
    os = "Windows";
    osVersion = "7";
  } else if (/windows/.test(lower)) {
    os = "Windows";
  } else if (/mac os x/.test(lower)) {
    os = "macOS";
    osVersion = (lower.match(/mac os x (\d+[._]\d+)/) || [])[1]?.replace(/_/g, ".") || "";
  } else if (/android (\d+)/.test(lower)) {
    os = "Android";
    osVersion = (lower.match(/android (\d+[\d.]*)/) || [])[1] || "";
  } else if (/iphone|ipad|ipod/.test(lower)) {
    os = "iOS";
    osVersion = (lower.match(/os (\d+[._]\d+)/) || [])[1]?.replace(/_/g, ".") || "";
  } else if (/linux/.test(lower)) {
    os = "Linux";
  } else if (/cros/.test(lower)) {
    os = "Chrome OS";
  }

  // Device detection
  let device = "Desktop";
  let deviceType = "desktop";
  let vendor = "";

  if (/iphone/.test(lower)) {
    device = "iPhone";
    deviceType = "mobile";
    vendor = "Apple";
  } else if (/ipad/.test(lower)) {
    device = "iPad";
    deviceType = "tablet";
    vendor = "Apple";
  } else if (/ipod/.test(lower)) {
    device = "iPod";
    deviceType = "mobile";
    vendor = "Apple";
  } else if (/android.*mobile/.test(lower)) {
    device = "Android Phone";
    deviceType = "mobile";
  } else if (/android/.test(lower)) {
    device = "Android Tablet";
    deviceType = "tablet";
  } else if (/windows phone/.test(lower)) {
    device = "Windows Phone";
    deviceType = "mobile";
  } else if (/mobile/.test(lower)) {
    device = "Mobile";
    deviceType = "mobile";
  } else if (/bot|crawler|spider|scraper/.test(lower)) {
    device = "Bot/Crawler";
    deviceType = "bot";
  }

  // Bot detection
  const isBot = /bot|crawler|spider|scraper|fetcher|preview|feed|rss|slurp|baidu|bing|yandex|facebook|twitter|linkedin|whatsapp|telegram|discord|skype/.test(lower);
  const botName = isBot ? (lower.match(/(googlebot|bingbot|slurp|baiduspider|yandexbot|facebookexternalhit|twitterbot|linkedinbot|whatsapp|telegrambot|discordbot|skypeuripreview)/)?.[1] || "Bot") : null;

  return {
    browser,
    browser_version: browserVersion,
    engine,
    engine_version: engineVersion,
    os,
    os_version: osVersion,
    device,
    device_type: deviceType,
    vendor: vendor || null,
    is_bot: isBot,
    bot_name: botName,
    is_mobile: deviceType === "mobile" || deviceType === "tablet",
  };
}
