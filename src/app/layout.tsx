import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import { TelegramProvider } from "@/components/telegram-provider";
import { AuthProvider } from "@/components/auth-provider";
import { AuthGate } from "@/components/auth-gate";
import { I18nProvider } from "@/components/i18n-provider";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans-tmp",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display-tmp",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

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
    <html
      lang="en"
      dir="ltr"
      suppressHydrationWarning
      className={`${inter.variable} ${spaceGrotesk.variable}`}
    >
      <head>
        {/* Telegram WebView injects its JS bridge natively. No CDN script needed. */}
        {/* TelegramProvider handles detection/fallback if not in WebView. */}
      </head>
      <body className="min-h-dvh">
        <TelegramProvider>
          <AuthProvider>
            <AuthGate>
              <I18nProvider>
                {children}
              </I18nProvider>
            </AuthGate>
          </AuthProvider>
        </TelegramProvider>
      </body>
    </html>
  );
}
