/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Telegram Mini Apps are typically embedded via iframe
  // Allow embedding in Telegram's iframe
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        {
          key: "Content-Security-Policy",
          value: "frame-ancestors 'self' https://telegram.org https://*.telegram.org;",
        },
      ],
    },
  ],
};

export default nextConfig;
