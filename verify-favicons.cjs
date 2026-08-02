const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

async function verifyFavicons() {
  console.log("=================================================");
  console.log("    AAMARVA FAVICON BINARY INTEGRITY VERIFIER    ");
  console.log("=================================================\n");

  const expectedPngs = [
    { name: "favicon-16x16.png", width: 16, height: 16 },
    { name: "favicon-32x32.png", width: 32, height: 32 },
    { name: "favicon-48x48.png", width: 48, height: 48 },
    { name: "favicon.png", width: 32, height: 32 },
    { name: "apple-touch-icon.png", width: 180, height: 180 },
    { name: "android-chrome-192x192.png", width: 192, height: 192 },
    { name: "android-chrome-512x512.png", width: 512, height: 512 },
    { name: "mstile-150x150.png", width: 150, height: 150 }
  ];

  let hasErrors = false;

  for (const item of expectedPngs) {
    const filePath = path.join(process.cwd(), "public", item.name);
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`File does not exist: public/${item.name}`);
      }

      const stats = fs.statSync(filePath);
      if (stats.size === 0) {
        throw new Error(`File is empty (0 bytes): public/${item.name}`);
      }

      const buffer = fs.readFileSync(filePath);

      // Verify PNG Magic Header: 89 50 4E 47 0D 0A 1A 0A
      const pngMagic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
      const headerValid = pngMagic.every((byte, idx) => buffer[idx] === byte);
      if (!headerValid) {
        throw new Error(`Invalid PNG header signature in public/${item.name}`);
      }

      // Parse with Sharp to verify image payload integrity and pixel stream decoding
      const meta = await sharp(buffer).metadata();
      if (meta.format !== "png") {
        throw new Error(`Sharp decoded format '${meta.format}', expected 'png'`);
      }

      // Decode raw RGBA pixels to verify uncorrupted DEFLATE stream
      const rawPixels = await sharp(buffer).raw().toBuffer();
      const expectedPixelBytes = meta.width * meta.height * 4;
      if (rawPixels.length !== expectedPixelBytes) {
        throw new Error(`Raw pixel buffer size mismatch: decoded ${rawPixels.length} bytes, expected ${expectedPixelBytes}`);
      }

      console.log(`[PASS] public/${item.name.padEnd(28)} | Format: PNG | Dimensions: ${meta.width}x${meta.height} | File Size: ${stats.size} bytes | Raw Pixels Verified`);
    } catch (err) {
      console.error(`[FAIL] public/${item.name.padEnd(28)} | Error: ${err.message}`);
      hasErrors = true;
    }
  }

  // Verify ICO File in public/
  const icoPath = path.join(process.cwd(), "public", "favicon.ico");
  try {
    if (!fs.existsSync(icoPath)) {
      throw new Error("File does not exist: public/favicon.ico");
    }
    const icoStats = fs.statSync(icoPath);
    if (icoStats.size === 0) {
      throw new Error("File is empty (0 bytes)");
    }
    const icoBuf = fs.readFileSync(icoPath);
    // ICO header signature: 00 00 01 00
    const icoValid = icoBuf[0] === 0 && icoBuf[1] === 0 && icoBuf[2] === 1 && icoBuf[3] === 0;
    if (!icoValid) {
      throw new Error("Invalid ICO header signature");
    }
    const imageCount = icoBuf.readUInt16LE(4);
    if (imageCount === 0) {
      throw new Error("ICO file contains 0 directory images");
    }
    console.log(`[PASS] public/${"favicon.ico".padEnd(28)} | Format: ICO | Size: ${icoStats.size} bytes | Directory Entries: ${imageCount}`);
  } catch (err) {
    console.error(`[FAIL] public/${"favicon.ico".padEnd(28)} | Error: ${err.message}`);
    hasErrors = true;
  }

  // Verify site.webmanifest in public/
  const manifestPath = path.join(process.cwd(), "public", "site.webmanifest");
  try {
    if (!fs.existsSync(manifestPath)) {
      throw new Error("File does not exist: public/site.webmanifest");
    }
    const content = fs.readFileSync(manifestPath, "utf8");
    const json = JSON.parse(content);
    if (!json.name || !Array.isArray(json.icons)) {
      throw new Error("WebManifest missing 'name' or 'icons' array");
    }
    console.log(`[PASS] public/${"site.webmanifest".padEnd(28)} | Format: JSON | App Name: "${json.name}" | Icons Count: ${json.icons.length}`);
  } catch (err) {
    console.error(`[FAIL] public/${"site.webmanifest".padEnd(28)} | Error: ${err.message}`);
    hasErrors = true;
  }

  console.log("\n=================================================");
  if (hasErrors) {
    console.error("VERIFICATION FAILED: One or more assets are missing or corrupted.");
    process.exit(1);
  } else {
    console.log("VERIFICATION SUCCESSFUL: All favicon assets are 100% valid, uncorrupted binary images!");
    console.log("=================================================\n");
  }
}

verifyFavicons().catch(err => {
  console.error("Fatal error during verification:", err);
  process.exit(1);
});
