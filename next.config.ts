import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root: a stray lockfile in a parent folder otherwise makes
  // Turbopack infer a wider tree, which can churn the dev watcher and HMR loops.
  turbopack: {
    root: path.resolve(__dirname),
  },
  serverExternalPackages: ["@remotion/renderer", "@remotion/bundler"],
  experimental: {
    serverActions: { bodySizeLimit: "20mb" },
  },
};

export default nextConfig;
