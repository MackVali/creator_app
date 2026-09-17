/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
];

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
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
