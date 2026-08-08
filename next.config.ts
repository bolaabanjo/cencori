import type { NextConfig } from "next";
import { createMDX } from "fumadocs-mdx/next";

const nextConfig: NextConfig = {
  // Transformers.js includes native ONNX binaries and runtime model loading.
  // Keep it out of Turbopack's module graph; API routes load it in Node only.
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node"],
  experimental: {
    optimizePackageImports: ["lucide-react"],
    staleTimes: {
      dynamic: 300,
      static: 300,
    },
  },
  async redirects() {
    return [
      // Docs landing → first page (no index.mdx at the docs root yet)
      { source: "/docs", destination: "/docs/introduction", permanent: false },
      // NOTE: legacy /dashboard/organizations/* redirects live in proxy.ts
      // now (see rewriteLegacyOrganizationsPath). Keeping them here would
      // create a double-hop because config-level redirects run before the
      // proxy, and they only knew about the intermediate URL shape.
    ];
  },
  async rewrites() {
    return [
      // Most agents probe /llms.txt (llmstxt.org convention); our file lives at
      // /llm.txt. Serve the same content at /llms.txt with a 200 (a rewrite, not
      // a redirect, so fetchers that don't follow 3xx still get the guide).
      { source: "/llms.txt", destination: "/llm.txt" },
    ];
  },
  // Configure images to allow all local paths (Next.js 16 requirement)
  images: {
    localPatterns: [
      {
        pathname: "/**",
      },
    ],
  },
  // Security and caching headers
  async headers() {
    // Security headers to apply to all routes
    const securityHeaders = [
      {
        key: "X-Content-Type-Options",
        value: "nosniff",
      },
      {
        key: "X-Frame-Options",
        value: "DENY",
      },
      {
        key: "X-XSS-Protection",
        value: "1; mode=block",
      },
      {
        key: "Referrer-Policy",
        value: "strict-origin-when-cross-origin",
      },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=()",
      },
    ];

    return [
      {
        // Apply security headers to ALL routes
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        // Cache OG image for 1 year (immutable since we version via filename)
        source: "/og-image.(jpg|png)",
        headers: [
          ...securityHeaders,
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        // Cache all static images for 1 year
        source: "/:all*.(jpg|jpeg|png|gif|webp|svg|ico)",
        headers: [
          ...securityHeaders,
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

const withMDX = createMDX();

export default withMDX(nextConfig);
