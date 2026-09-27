import type { NextConfig } from "next";

const API_URL = process.env.API_URL ?? "http://localhost:8080";

const nextConfig: NextConfig = {
  // Proxy API calls to the Go backend so the auth cookie stays same-origin.
  async rewrites() {
    return [{ source: "/api/v1/:path*", destination: `${API_URL}/api/v1/:path*` }];
  },
};

export default nextConfig;
