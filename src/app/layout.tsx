export const dynamic = 'force-dynamic';
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Cairo } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { DirectionProvider } from "@/components/providers/direction-provider";
import { FixTransparentColors } from "@/components/FixTransparentColors";
import { ErrorSuppressor } from "@/components/ErrorSuppressor";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin", "latin-ext"],
  weight: ["200", "300", "400", "500", "600", "700", "800", "900"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Anzaro AI — ذكاء اصطناعي عربي",
  description: "Anzaro AI — منصة الذكاء الاصطناعي العربي. شات، توليد صور، بودكاست، راديو، والمزيد.",
  keywords: ["Anzaro AI", "انزارو", "AI", "Arabic AI", "ذكاء اصطناعي", "شات", "توليد صور", "بودكاست"],
  authors: [{ name: "Anzaro AI" }],
  manifest: "/manifest.json",
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Anzaro",
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    title: "Anzaro AI — ذكاء اصطناعي عربي",
    description: "منصة الذكاء الاصطناعي العربي. شات، توليد صور، بودكاست، راديو، والمزيد.",
    siteName: "Anzaro AI",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Anzaro AI — ذكاء اصطناعي عربي",
    description: "منصة الذكاء الاصطناعي العربي",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f0f1e",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${cairo.variable} antialiased bg-background text-foreground font-[family-name:var(--font-cairo)]`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange={false}
        >
          <DirectionProvider>
            <FixTransparentColors />
      <ErrorSuppressor />
            {children}
          </DirectionProvider>
          <Toaster
            position="top-center"
            richColors
            closeButton
            dir="auto"
            toastOptions={{
              style: {
                borderRadius: "14px",
                fontFamily: "var(--font-cairo), -apple-system, sans-serif",
              },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
