import type { NextConfig } from "next";

// Where the FastAPI backend runs. The widget calls /api/* on this site and Next.js forwards it there,
// so embedding the widget only needs the frontend URL. Set BACKEND_URL before `npm run build`.
const backendUrl = (process.env.BACKEND_URL || "http://localhost:8000").replace(/\/$/, "");

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backendUrl}/api/:path*` }];
  },
};

export default nextConfig;
