import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // شيلنا standalone لأنه بيـ crash مع force-dynamic في "Collecting page data"
  // next start هيستخدم .next العادي
  allowedDevOrigins: ["kopabdo-delta-ai-v2.hf.space"],
  typescript: {
    ignoreBuildErrors: true,
  },
  // خلي كل الصفحات dynamic (مش static) — ده بيمنع crash في "Generating static pages"
  // لأن صفحات بتستخدم browser APIs (localStorage, window) بتـ crash وقت prerender
  experimental: {
    cpus: 1,
    workerThreads: false,
    optimizePackageImports: [
      'lucide-react',
      'recharts',
      'framer-motion',
      '@radix-ui/react-icons',
      'date-fns',
      'react-markdown',
      '@tanstack/react-query',
    ],
  },
  // SECURITY FIX: Enable React Strict Mode to catch potential issues
  reactStrictMode: true,
  // Ensure server-only packages are not bundled into client code
  serverExternalPackages: [
    "playwright",
    "playwright-core",
    "sharp",
    "googleapis",
    "google-auth-library",
    "@anthropic-ai/sdk",
    "@modelcontextprotocol/sdk",
    "nodemailer",
    "bcryptjs",
    "ioredis",
    "telegraf",
    "msedge-tts",
    "ws",
    "isomorphic-ws",
    "pdf2json",
    "unpdf",
    "officeparser",
    "mammoth",
    "exceljs",
    "pptxgenjs",
    "docx",
    "adm-zip",
    "qrcode",
    "z-ai-web-dev-sdk",
  ],
  // Reduce build memory usage — use 1 worker instead of auto-detecting all CPUs
  // This prevents OOM on constrained environments like HuggingFace Spaces
  experimental: {
    cpus: 1,
    workerThreads: false,
    // Optimize package imports to reduce bundle size and memory usage
    optimizePackageImports: [
      'lucide-react',
      'recharts',
      'framer-motion',
      '@radix-ui/react-icons',
      'date-fns',
      'react-markdown',
      '@tanstack/react-query',
      '@radix-ui/react-accordion',
      '@radix-ui/react-alert-dialog',
      '@radix-ui/react-avatar',
      '@radix-ui/react-checkbox',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-popover',
      '@radix-ui/react-select',
      '@radix-ui/react-tabs',
      '@radix-ui/react-tooltip',
    ],
  },
  // Fix: Handle Node.js built-in modules in browser bundle
  // Some packages (googleapis, etc.) reference Node built-ins that don't exist in browser
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      // Don't try to bundle Node.js built-in modules in the browser
      config.resolve.fallback = {
        ...config.resolve.fallback,
        child_process: false,
        fs: false,
        net: false,
        tls: false,
        dns: false,
        http2: false,
        'async_hooks': false,
        'perf_hooks': false,
        'stream': false,
        'crypto': false,
        'zlib': false,
        'url': false,
        'path': false,
        'os': false,
        'http': false,
        'https': false,
        'util': false,
        'querystring': false,
        'buffer': false,
        'events': false,
        'assert': false,
        'stream/web': false,
      };

      // Handle node: protocol URIs (e.g., "node:net", "node:fs")
      // Webpack's resolve.alias doesn't handle the "node:" URI scheme.
      // IgnorePlugin intercepts these at the module resolution level.
      config.plugins = config.plugins || [];
      config.plugins.push(
        new webpack.IgnorePlugin({
          resourceRegExp: /^node:/,
        })
      );

      // Ignore googleapis in client bundle (uses Node built-ins, server-only)
      config.plugins.push(
        new webpack.IgnorePlugin({
          resourceRegExp: /^googleapis$/,
        })
      );
    }
    return config;
  },
  // ── Security headers: allow YouTube embeds + media playback ──
  // HuggingFace proxy sets restrictive CSP. We override with ours.
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://sdk.scdn.co",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob: https: http:",
              "media-src 'self' data: blob: https: http:",
              "connect-src 'self' https: wss: blob:",
              "frame-src 'self' https://www.youtube.com https://youtube.com https://*.youtube.com https://open.spotify.com https://sdk.scdn.co",
              "frame-ancestors 'self' https://huggingface.co https://*.huggingface.co",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
