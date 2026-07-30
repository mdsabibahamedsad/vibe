/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // Telegram Mini Apps are embedded inside Telegram (t.me/telegram.org iframe)
  // and use a JavaScript bridge injected by the native WebView.
  // Security headers balance protection with Telegram Mini App compatibility.
  //
  // Key considerations:
  //   1. frame-ancestors must allow telegram.org AND t.me for the iframe embed
  //   2. script-src must allow 'unsafe-inline' for Telegram's injected bridge
  //   3. connect-src must allow *.telegram.org for the WebSocket event bridge
  //   4. frame-src and child-src must allow telegram.org for embedded content
  //   5. X-Frame-Options must NOT be set (would block Telegram's iframe entirely)
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        {
          key: "Content-Security-Policy",
          value: [
            // frame-ancestors: allow Telegram to embed the Mini App
            "frame-ancestors 'self' https://telegram.org https://*.telegram.org https://t.me https://*.t.me;",
            // frame-src: allow Telegram sources if the app uses frames
            "frame-src 'self' https://telegram.org https://*.telegram.org;",
            // default-src: restrict everything not explicitly listed
            "default-src 'self';",
            // script-src: 'unsafe-inline' required for Telegram WebView's injected bridge
            //             https://telegram.org + *.telegram.org for SDK
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://telegram.org https://*.telegram.org;",
            "style-src 'self' 'unsafe-inline';",
            // connect-src: Supabase (REST + WSS), Telegram (REST + WSS bridge)
            "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.telegram.org https://*.telegram.org wss://*.telegram.org wss://*.t.me;",
            "img-src 'self' data: https: blob:;",
            "media-src 'self' https: blob:;",
            "font-src 'self' data:;",
            "object-src 'none';",
            "base-uri 'self';",
            "form-action 'self';",
            // Allow loading scripts from Telegram for SDK
            "worker-src 'self' blob:;",
          ].join(" "),
        },
        {
          key: "Referrer-Policy",
          value: "strict-origin-when-cross-origin",
        },
        {
          key: "X-Content-Type-Options",
          value: "nosniff",
        },
        {
          key: "Permissions-Policy",
          value: [
            "camera=()",
            "microphone=()",
            "geolocation=()",
            "interest-cohort=()",
            "payment=(self)",
            "display-capture=()",
          ].join(", "),
        },
        // X-Frame-Options intentionally NOT set.
        // Telegram Mini Apps are embedded inside Telegram's iframe.
        // CSP frame-ancestors handles this with full flexibility.
        // X-Frame-Options: SAMEORIGIN would BLOCK Telegram's iframe entirely.
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains; preload",
        },
        {
          key: "X-DNS-Prefetch-Control",
          value: "on",
        },
      ],
    },
    // Specific CSP for the /api/:path* endpoints (minimal)
    {
      source: "/api/:path*",
      headers: [
        {
          key: "Content-Security-Policy",
          value: [
            "frame-ancestors 'self' https://telegram.org https://*.telegram.org https://t.me https://*.t.me;",
            "frame-src 'self' https://telegram.org https://*.telegram.org;",
            "default-src 'self';",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://telegram.org https://*.telegram.org;",
          ].join(" "),
        },
      ],
    },
  ],

  // Secure defaults for production
  compiler: {
    removeConsole: process.env.NODE_ENV === "production" && {
      exclude: ["error", "warn"],
    },
  },
};

export default nextConfig;
