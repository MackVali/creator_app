import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["lucide-react", "@tanstack/react-query"],
  },
  // Ensure proper output for Vercel
  output: "standalone",
  // Handle SPA routing
  trailingSlash: false,
  // Ensure proper redirects for auth
  async redirects() {
    return [
      {
        source: "/",
        destination: "/dashboard",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
