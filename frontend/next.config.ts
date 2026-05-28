import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  turbopack: {
    root: path.resolve(__dirname),
  },
  devIndicators: false,
  async rewrites() {
    // LOCAL: NEXT_PUBLIC_API_URL is set → client calls backend directly, rewrites unused.
    // PROD:  NEXT_PUBLIC_API_URL is unset → client sends relative /api/* → Next.js server
    //        proxies here using PUBLIC_API_URL (runtime, never baked into the bundle).
    const backendUrl = process.env.BE_BASE_URL ?? "http://localhost:8099";
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
      {
        source: "/cash-api/:path*",
        destination: `${backendUrl}/cash-api/:path*`,
      },
    ];
  },
};

export default nextConfig;
