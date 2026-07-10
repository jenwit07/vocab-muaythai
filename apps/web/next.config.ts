import type { NextConfig } from "next";
import dotenv from "dotenv";
import { resolve } from "node:path";

// Load env from monorepo root
dotenv.config({ path: resolve(import.meta.dirname, "../../.env") });

const nextConfig: NextConfig = {
  transpilePackages: ["@repo/db", "@repo/ai"],
  serverExternalPackages: ["mongodb"],
};

export default nextConfig;
