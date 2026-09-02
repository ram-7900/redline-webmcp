import type { NextConfig } from "next";

/**
 * The Python transform service is reached through a same-origin path so the browser
 * never issues a cross-origin request — no CORS preflight in front of every bulk
 * transform, and no second origin to get wrong in production.
 */
const transformServiceUrl =
  process.env.PY_API_URL ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/py/:path*",
        destination: `${transformServiceUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
