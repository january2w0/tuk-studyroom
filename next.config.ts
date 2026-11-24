import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Personal database pages do not need prerendering or partial prefetching.
  cacheComponents: false,
};

export default nextConfig;
