import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The pages/ folder contains static GitHub Pages assets, not framework routes.
  pageExtensions: ["ts", "tsx"],
};

export default nextConfig;
