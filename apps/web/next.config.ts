import { existsSync } from "node:fs";
import type { NextConfig } from "next";

// Monorepo convenience: share the single root .env with the web app in local development.
const rootEnv = new URL("../../.env", import.meta.url).pathname;
if (process.env.NODE_ENV !== "production" && existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const apiOrigin = process.env.API_INTERNAL_URL ?? process.env.API_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  output: "standalone",
  // Trace files from the monorepo root so the standalone bundle includes workspace deps.
  outputFileTracingRoot: new URL("../../", import.meta.url).pathname,
  transpilePackages: ["@ika/shared"],
  poweredByHeader: false,
  reactStrictMode: true,
  turbopack: {
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
  // In production Nginx routes /api/* to the API directly; this rewrite serves local dev
  // and keeps the browser same-origin in both cases (no CORS, no third-party cookies).
  async rewrites() {
    return [{ source: "/api/v1/:path*", destination: `${apiOrigin}/api/v1/:path*` }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
