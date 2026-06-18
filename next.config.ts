import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project. Without this, Next infers the root
  // from the nearest lockfile and can pick up an unrelated package-lock.json in
  // the home directory (which triggers the "multiple lockfiles" warning).
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
