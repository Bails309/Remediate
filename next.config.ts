import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    proxyClientMaxBodySize: "50mb",
    // simple-icons is a ~3,300 icon barrel; without this every brand icon lands
    // in the client bundle.
    optimizePackageImports: ["simple-icons"],
  },
  poweredByHeader: false,
  // pdf-parse (and its pdfjs-dist dependency) ship a worker file that Next.js's
  // bundler cannot resolve when the package is inlined into the server build.
  // Marking these packages as external keeps them on disk so pdfjs can locate
  // its own worker assets at runtime.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
};

export default nextConfig;
