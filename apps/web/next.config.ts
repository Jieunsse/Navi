import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@nabi/shared", "@nabi/core"],
  serverExternalPackages: ["firebase-admin"],
  turbopack: {
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
};

export default nextConfig;
