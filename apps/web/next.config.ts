import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 도커용(README의 Docker 절). 모노레포라 추적 기준을 레포 루트로 잡아야 packages/*가 함께 담긴다.
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  transpilePackages: ["@nabi/shared", "@nabi/core"],
  serverExternalPackages: ["firebase-admin"],
  turbopack: {
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
};

export default nextConfig;
