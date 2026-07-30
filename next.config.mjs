/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // Telegram Mini Apps are typically embedded via iframe
  // Security headers are configured to balance protection with
  // Telegram Mini App compatibility
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        {
          key: "Content-Security-Policy",
          value: [
            "frame-ancestors 'self' https://telegram.org https://*.telegram.org;",
            "default-src 'self';",
            "script-src 'self' 'unsafe-eval' https://telegram.org;",
            "style-src 'self' 'unsafe-inline';",
            "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.telegram.org;",
            "img-src 'self' data: https: blob:;",
            "media-src 'self' https: blob:;",
            "font-src 'self' data:;",
            "object-src 'none';",
            "base-uri 'self';",
            "form-action 'self';",
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
        // Telegram Mini Apps are embedded inside Telegram's iframe from telegram.org.
        // Content-Security-Policy frame-ancestors handles this with more flexibility.
        // Setting X-Frame-Options: SAMEORIGIN would BLOCK Telegram's iframe entirely.
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
    // Specific CSP for the /api/health endpoint (minimal)
    {
      source: "/api/:path*",
      headers: [
        {
          key: "Content-Security-Policy",
          value: "frame-ancestors 'self' https://telegram.org https://*.telegram.org;",
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
