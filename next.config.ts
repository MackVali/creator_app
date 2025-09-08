/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ["@supabase/supabase-js"],
  },
  images: {
    remotePatterns: [
      { hostname: "i.pravatar.cc" },
      { hostname: "upload.wikimedia.org" },
    ],
  },
  // Remove these lines to expose real errors:
  // typescript: { ignoreBuildErrors: true },
  // eslint: { ignoreDuringBuilds: true },
};

module.exports = nextConfig;
