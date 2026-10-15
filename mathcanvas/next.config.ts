import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

/**
 * The handwriting API (../mathcanvas-api). The browser calls /api/ink/* on this
 * site and the request is forwarded there, so the API's address stays private
 * and no cross-origin setup is needed. Read when the app is built.
 */
const HANDWRITING_API = (process.env.MATHCANVAS_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/api/ink/:path*", destination: `${HANDWRITING_API}/:path*` }];
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

// Translations: src/i18n/request.ts, messages/{vi,en}.json.
export default createNextIntlPlugin()(nextConfig);
