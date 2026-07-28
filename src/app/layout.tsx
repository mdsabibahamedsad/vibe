import type { Metadata, Viewport } from "next";
import { TelegramProvider } from "@/components/telegram-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vibe — Social Discovery",
  description: "Connect, discover, and vibe with people on Telegram",
  other: {
    "tg:channel": "@vibe_app",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Telegram WebApp script */}
        <script src="https://telegram.org/js/telegram-web-app.js" async />
      </head>
      <body className="min-h-dvh">
        <TelegramProvider>{children}</TelegramProvider>
      </body>
    </html>
  );
}
