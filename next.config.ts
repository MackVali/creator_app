/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: [
    "@supabase/supabase-js",
    "@supabase/ssr",
    "@supabase/realtime-js",
  ],
  env: {
    NEXT_PUBLIC_SUPABASE_URL:
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      process.env.VITE_SUPABASE_ANON_KEY ??
      "",
    NEXT_PUBLIC_VERCEL_ENV:
      process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.VERCEL_ENV ?? "",
    NEXT_PUBLIC_VERCEL_URL:
      process.env.NEXT_PUBLIC_VERCEL_URL ?? process.env.VERCEL_URL ?? "",
  },
  images: {
    remotePatterns: [
      { hostname: "i.pravatar.cc" },
      { hostname: "upload.wikimedia.org" },
    ],
  },
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
};

module.exports = nextConfig;
