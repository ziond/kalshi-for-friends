import type { NextConfig } from "next";

const API_URL = process.env.API_URL ?? "http://localhost:8080";

const nextConfig: NextConfig = {
  // Dev only: let other devices on the network (e.g. a phone at http://10.9.129.1:3000) use
  // hot reload. Next blocks non-localhost origins from /_next dev resources by default.
  allowedDevOrigins: ["10.9.129.1"],
  // Proxy API calls to the Go backend so the auth cookie stays same-origin.
  async rewrites() {
    return [{ source: "/api/v1/:path*", destination: `${API_URL}/api/v1/:path*` }];
  },
};

export default nextConfig;
