const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function main() {
  console.log('==================================================');
  console.log('   AAMARVA PRODUCTION FAVICON GENERATOR & AUDIT   ');
  console.log('==================================================');

  // 1. Locate master logo source file
  const srcName = 'ChatGPT Image Aug 2, 2026, 03_13_42 PM.png';
  let srcPath = path.join(process.cwd(), srcName);

  if (!fs.existsSync(srcPath)) {
    // Attempt fallback lookup in current directory
    srcPath = path.resolve(srcName);
    if (!fs.existsSync(srcPath)) {
      console.error(`[ERROR] Master logo image not found at: ${srcPath}`);
      process.exit(1);
    }
  }

  console.log(`[INFO] Master logo source found at: ${srcPath}`);

  // 2. Validate source image integrity
  try {
    const metadata = await sharp(srcPath).metadata();
    console.log(`[INFO] Source image validated. Format: ${metadata.format}, Dimensions: ${metadata.width}x${metadata.height}`);
    if (metadata.format !== 'png') {
      console.warn(`[WARN] Master source is format '${metadata.format}', expected 'png'.`);
    }
  } catch (err) {
    console.error(`[ERROR] Source image is invalid or corrupt!`, err);
    process.exit(1);
  }

  // 3. Ensure target public directory exists
  const publicDir = path.join(process.cwd(), 'public');
  if (!fs.existsSync(publicDir)) {
    console.log(`[INFO] Creating public/ directory...`);
    fs.mkdirSync(publicDir, { recursive: true });
  }

  const buf = fs.readFileSync(srcPath);

  // Helper to resize and save as PNG
  const generatePng = async (width, height, destName) => {
    const destPath = path.join(publicDir, destName);
    await sharp(buf)
      .resize(width, height, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toFile(destPath);
    console.log(`  -> Generated: public/${destName} (${width}x${height})`);
  };

  console.log(`[INFO] Generating PNG assets...`);
  // Standard and modern PNG favicons
  await generatePng(16, 16, 'favicon-16x16.png');
  await generatePng(32, 32, 'favicon-32x32.png');
  await generatePng(48, 48, 'favicon-48x48.png');
  await generatePng(96, 96, 'favicon-96x96.png');
  await generatePng(512, 512, 'favicon.png');

  // Apple Touch Icon
  await generatePng(180, 180, 'apple-touch-icon.png');

  // Android Chrome icons for PWA
  await generatePng(192, 192, 'android-chrome-192x192.png');
  await generatePng(512, 512, 'android-chrome-512x512.png');

  // 4. Generate multi-resolution ICO (16x16, 32x32, 48x48)
  console.log(`[INFO] Generating multi-resolution public/favicon.ico...`);
  const png16 = await sharp(buf).resize(16, 16, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const png32 = await sharp(buf).resize(32, 32, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const png48 = await sharp(buf).resize(48, 48, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();

  const images = [png16, png32, png48];
  const headerSize = 6;
  const dirEntrySize = 16;
  let offset = headerSize + (dirEntrySize * images.length);

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0); // Reserved: Must be 0
  header.writeUInt16LE(1, 2); // Type: 1 for ICO
  header.writeUInt16LE(images.length, 4); // Number of images

  const dirEntries = [];
  const dims = [16, 32, 48];
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const dim = dims[i];
    const entry = Buffer.alloc(dirEntrySize);
    entry.writeUInt8(dim, 0); // Width
    entry.writeUInt8(dim, 1); // Height
    entry.writeUInt8(0, 2);   // Color palette
    entry.writeUInt8(0, 3);   // Reserved
    entry.writeUInt16LE(1, 4); // Color planes
    entry.writeUInt16LE(32, 6); // Bits per pixel
    entry.writeUInt32LE(img.length, 8); // Image size in bytes
    entry.writeUInt32LE(offset, 12); // Image offset
    dirEntries.push(entry);
    offset += img.length;
  }

  const icoBuffer = Buffer.concat([header, ...dirEntries, ...images]);
  fs.writeFileSync(path.join(publicDir, 'favicon.ico'), icoBuffer);
  console.log(`  -> Generated: public/favicon.ico (Multi-res: 16px, 32px, 48px)`);

  // 5. Generate scalable SVG favicon (using embedded high-res base64)
  console.log(`[INFO] Generating scalable public/favicon.svg...`);
  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <image href="data:image/png;base64,${buf.toString('base64')}" width="512" height="512"/>
</svg>`;
  fs.writeFileSync(path.join(publicDir, 'favicon.svg'), svgContent);
  console.log(`  -> Generated: public/favicon.svg`);

  // 6. Generate site.webmanifest for PWA and Android devices
  console.log(`[INFO] Generating site.webmanifest...`);
  const manifest = {
    name: "AAMARVA",
    short_name: "AAMARVA",
    icons: [
      {
        src: "/android-chrome-192x192.png",
        sizes: "192x192",
        type: "image/png"
      },
      {
        src: "/android-chrome-512x512.png",
        sizes: "512x512",
        type: "image/png"
      }
    ],
    theme_color: "#000000",
    background_color: "#000000",
    display: "standalone"
  };
  fs.writeFileSync(path.join(publicDir, 'site.webmanifest'), JSON.stringify(manifest, null, 2));
  console.log(`  -> Generated: public/site.webmanifest`);

  console.log('==================================================');
  console.log('   FAVICON GENERATION COMPLETED SUCCESSFULLY!    ');
  console.log('==================================================');
}

main().catch(err => {
  console.error('[CRITICAL] Favicon generation failed:', err);
  process.exit(1);
});
