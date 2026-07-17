import type { Metadata } from "next";
import { Geist, Geist_Mono, Cairo } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { AppProviders } from "@/components/providers/app-providers";

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
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Anzaro AI — The Smart Ball",
  description:
    "Anzaro AI: a local-first AI Home OS. Personality-aware companion inside The Smart Ball — reversed command control, Home Assistant authority, and proactive intelligence.",
  keywords: [
    "Anzaro AI",
    "Smart Ball",
    "AI Home OS",
    "Home Assistant",
    "Personality AI",
    "Voice Assistant",
  ],
  authors: [{ name: "Anzaro" }],
  icons: {
    icon: "/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${cairo.variable} antialiased bg-background text-foreground`}
      >
        <AppProviders>
          {children}
        </AppProviders>
        <Toaster />
        <SonnerToaster position="top-center" richColors />
      </body>
    </html>
  );
}
