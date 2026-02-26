import type { NextConfig } from "next";

const isMobileBuild = process.env.NEXT_OUTPUT === "export";

const nextConfig: NextConfig = {
  ...(isMobileBuild ? { output: "export" } : {}),
  ...(!isMobileBuild ? { serverExternalPackages: ["playwright"] } : {}),
};

if (isMobileBuild) {
  console.log("Building for mobile (static export)...");
}

export default nextConfig;
