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
    // Ask Neoflo Flask backend — must come BEFORE the general /api/* proxy
    // so Next.js matches it first (rewrites are first-match-wins).
    const askNefloUrl = process.env.ASK_NEOFLO_API_URL ?? "http://65.1.10.248:5002";
    return [
      // Ask Neoflo → Flask app (SSE streaming + REST)
      {
        source: "/api/ask-neoflo/:path*",
        destination: `${askNefloUrl}/api/:path*`,
      },
      // Everything else → FastAPI backend
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
      {
        source: "/cash-api/:path*",
        destination: `${backendUrl}/cash-api/:path*`,
      },
      {
        source: "/claim-api/:path*",
        destination: `${backendUrl}/claim-api/:path*`,
      },
    ];
  },
};

export default nextConfig;
