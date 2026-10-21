import type { NextConfig } from "next";
import { securityHeaders } from "./lib/security-headers";

const nextConfig: NextConfig = {
  transpilePackages: ["@cofounderai/core", "@cofounderai/module-registry"],

  // PLATFORM-P1-08.1: when this build was made, shown on System Health. Inlined at build.
  env: { WONDERARK_BUILT_AT: new Date().toISOString() },

  experimental: {
    // Server actions default to a 1 MB body, which refuses most real uploads (marketing
    // assets, data-room documents, job photos). Vercel itself caps request bodies at
    // 4.5 MB, so this matches that ceiling; the upload code checks its own, lower limit.
    serverActions: { bodySizeLimit: "4.5mb" },
  },

  // SEC-4: security headers on every response, static assets included.
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders({ isDev: process.env.NODE_ENV === "development" }) },
      // PLATFORM-P1-13.1: the application status page's address carries the applicant's
      // token. Listed after the baseline so its Referrer-Policy wins: the token is never
      // sent on as a referrer, and the page is never indexed.
      {
        source: "/careers/status",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },

  async redirects() {
    return [
      {
        // The guides used to live behind the login, at /dashboard/help. Every link that
        // was shared or bookmarked while they did still has to land somewhere, including
        // deep links into a single section -- and now it lands there without a session.
        source: "/dashboard/help/:path*",
        destination: "/help/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
