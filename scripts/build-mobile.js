/**
 * Build script for Capacitor mobile app.
 * Assembles the `out/` directory from Next.js build output
 * since `output: "export"` doesn't work with API routes present.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const NEXT_DIR = path.join(ROOT, ".next");
const OUT_DIR = path.join(ROOT, "out");

// Clean out directory
if (fs.existsSync(OUT_DIR)) {
  fs.rmSync(OUT_DIR, { recursive: true });
}
fs.mkdirSync(OUT_DIR, { recursive: true });

// 1. Copy pre-rendered HTML pages
const serverApp = path.join(NEXT_DIR, "server", "app");
const htmlFiles = {
  "index.html": "index.html",
  "settings.html": "settings/index.html",
};

for (const [src, dest] of Object.entries(htmlFiles)) {
  const srcPath = path.join(serverApp, src);
  if (fs.existsSync(srcPath)) {
    const destPath = path.join(OUT_DIR, dest);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.copyFileSync(srcPath, destPath);
    console.log(`Copied ${src} -> ${dest}`);
  }
}

// 2. Copy _next/static directory (JS, CSS chunks)
const staticSrc = path.join(NEXT_DIR, "static");
const staticDest = path.join(OUT_DIR, "_next", "static");
if (fs.existsSync(staticSrc)) {
  copyDirSync(staticSrc, staticDest);
  console.log("Copied _next/static/");
}

// 3. Copy public directory (manifest, icons, etc.)
const publicDir = path.join(ROOT, "public");
if (fs.existsSync(publicDir)) {
  copyDirSync(publicDir, OUT_DIR);
  console.log("Copied public/");
}

console.log("\nMobile build complete! out/ directory ready for Capacitor.");
console.log("Run: npx cap sync android");

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
