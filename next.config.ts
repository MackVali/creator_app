/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: [
    "@supabase/supabase-js",
    "@supabase/ssr",
    "@supabase/realtime-js",
  ],
  images: {
    remotePatterns: [
      { hostname: "i.pravatar.cc" },
      { hostname: "upload.wikimedia.org" },
      {
        protocol: "https",
        hostname: "ndluqrtcevprjlzzdjbi.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
