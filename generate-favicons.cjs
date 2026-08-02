const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const pngToIcoModule = require("png-to-ico");
const pngToIco = pngToIcoModule.default || pngToIcoModule;

// Geometric AAMARVA Monogram Emblem SVG (White geometric A emblem on black background)
const logoSvg = `<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" fill="#000000"/>
  <path d="M256 80 L400 416 H328 L256 252 L184 416 H112 L256 80 Z" fill="#FFFFFF"/>
  <path d="M220 320 H292 L256 230 L220 320 Z" fill="#000000"/>
</svg>`;

async function generate() {
  console.log("=== GENERATING HIGH-COMPATIBILITY AAMARVA FAVICON & LOGO ASSETS ===");
  const publicDir = path.join(process.cwd(), "public");
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  // Look for uploaded screenshot logo
  let screenshotFile = path.join(process.cwd(), "Screenshot 2026-07-31 22.09.24.png");
  if (!fs.existsSync(screenshotFile)) {
    // Check for any file starting with Screenshot
    const files = fs.readdirSync(process.cwd());
    const match = files.find(f => f.startsWith("Screenshot") && f.endsWith(".png"));
    if (match) {
      screenshotFile = path.join(process.cwd(), match);
    }
  }

  let inputBuffer;
  if (fs.existsSync(screenshotFile) && fs.statSync(screenshotFile).size > 0) {
    console.log("Spotting and using uploaded file:", path.basename(screenshotFile));
    inputBuffer = fs.readFileSync(screenshotFile);
    fs.copyFileSync(screenshotFile, path.join(publicDir, "logo.png"));
    fs.copyFileSync(screenshotFile, path.join(publicDir, "screenshot-logo.png"));
    console.log("Saved public/logo.png and public/screenshot-logo.png from uploaded screenshot");
  } else {
    console.log("Using SVG logo buffer");
    inputBuffer = Buffer.from(logoSvg, "utf8");
  }

  // Write text-based SVG files (viewable in AI Studio text code editor)
  fs.writeFileSync(path.join(publicDir, "favicon.svg"), logoSvg, "utf8");
  fs.writeFileSync(path.join(publicDir, "logo.svg"), logoSvg, "utf8");
  console.log("Generated public/favicon.svg and public/logo.svg");

  const sizes = [
    { name: "logo.png", width: 512, height: 512 },
    { name: "favicon-16x16.png", width: 16, height: 16 },
    { name: "favicon-32x32.png", width: 32, height: 32 },
    { name: "favicon-48x48.png", width: 48, height: 48 },
    { name: "favicon.png", width: 32, height: 32 },
    { name: "apple-touch-icon.png", width: 180, height: 180 },
    { name: "android-chrome-192x192.png", width: 192, height: 192 },
    { name: "android-chrome-512x512.png", width: 512, height: 512 },
    { name: "mstile-150x150.png", width: 150, height: 150 }
  ];

  for (const item of sizes) {
    const outPath = path.join(publicDir, item.name);
    if (fs.existsSync(screenshotFile) && fs.statSync(screenshotFile).size > 0) {
      fs.copyFileSync(screenshotFile, outPath);
      console.log(`Copied exact screenshot to public/${item.name}`);
    } else {
      await sharp(svgBuffer)
        .resize(item.width, item.height)
        .png({ compressionLevel: 6, force: true })
        .toFile(outPath);
      console.log(`Generated public/${item.name} (${item.width}x${item.height})`);
    }
  }

  // Generate ICO containing 16x16 and 32x32 frames
  try {
    const tmp16 = path.join(publicDir, "_tmp16.png");
    const tmp32 = path.join(publicDir, "_tmp32.png");
    await sharp(inputBuffer).resize(16, 16).png().toFile(tmp16);
    await sharp(inputBuffer).resize(32, 32).png().toFile(tmp32);
    const icoBuf = await pngToIco([tmp16, tmp32]);
    fs.writeFileSync(path.join(publicDir, "favicon.ico"), icoBuf);
    if (fs.existsSync(tmp16)) fs.unlinkSync(tmp16);
    if (fs.existsSync(tmp32)) fs.unlinkSync(tmp32);
    console.log("Generated public/favicon.ico");
  } catch (err) {
    console.warn("Warning generating favicon.ico:", err.message);
  }

  // Create site.webmanifest
  const manifest = {
    name: "AAMARVA | Autonomous Agent Network",
    short_name: "AAMARVA",
    icons: [
      {
        src: "/android-chrome-192x192.png?v=1",
        sizes: "192x192",
        type: "image/png"
      },
      {
        src: "/android-chrome-512x512.png?v=1",
        sizes: "512x512",
        type: "image/png"
      },
      {
        src: "/favicon.svg",
        sizes: "any",
        type: "image/svg+xml"
      }
    ],
    theme_color: "#000000",
    background_color: "#000000",
    display: "standalone"
  };
  fs.writeFileSync(path.join(publicDir, "site.webmanifest"), JSON.stringify(manifest, null, 2), "utf8");
  console.log("Generated public/site.webmanifest");

  // Sync to dist directory if it exists
  const distDir = path.join(process.cwd(), "dist");
  if (fs.existsSync(distDir)) {
    const filesToSync = [
      ...sizes.map(s => s.name),
      "favicon.ico",
      "favicon.svg",
      "logo.svg",
      "site.webmanifest"
    ];
    if (fs.existsSync(path.join(publicDir, "logo.png"))) {
      filesToSync.push("logo.png");
    }
    for (const file of filesToSync) {
      fs.copyFileSync(path.join(publicDir, file), path.join(distDir, file));
    }
    console.log("Synced generated assets to dist/");
  }

  console.log("Favicon generation complete.\n");
}

generate().catch(err => {
  console.error("Error generating favicons:", err);
  process.exit(1);
});
