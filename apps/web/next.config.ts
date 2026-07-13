import type { NextConfig } from "next";
import dotenv from "dotenv";
import { resolve } from "node:path";

// Load env from monorepo root (dev only — production uses real env vars)
dotenv.config({ path: resolve(import.meta.dirname, "../../.env") });

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@repo/db", "@repo/ai"],
  serverExternalPackages: ["mongodb"],
};

export default nextConfig;
