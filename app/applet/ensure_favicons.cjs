const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function checkAndEnsureFavicons() {
  const srcName = 'ChatGPT Image Aug 2, 2026, 03_13_42 PM.png';
  const srcPath = path.join('public', srcName);

  if (!fs.existsSync(srcPath)) {
    console.error('Source image not found in public!');
    process.exit(1);
  }

  const buf = fs.readFileSync(srcPath);

  // Ensure all required static favicon files are correctly generated in public/
  const png512 = await sharp(buf).resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  fs.writeFileSync('public/favicon.png', png512);
  fs.writeFileSync('public/logo.png', png512);

  const png96 = await sharp(buf).resize(96, 96, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  fs.writeFileSync('public/favicon-96x96.png', png96);

  const png180 = await sharp(buf).resize(180, 180, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  fs.writeFileSync('public/apple-touch-icon.png', png180);

  const png16 = await sharp(buf).resize(16, 16, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const png32 = await sharp(buf).resize(32, 32, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const png48 = await sharp(buf).resize(48, 48, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();

  // ICO generator
  const images = [png16, png32, png48];
  const headerSize = 6;
  const dirEntrySize = 16;
  let offset = headerSize + (dirEntrySize * images.length);

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  const dirEntries = [];
  const dims = [16, 32, 48];
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const dim = dims[i];
    const entry = Buffer.alloc(dirEntrySize);
    entry.writeUInt8(dim, 0);
    entry.writeUInt8(dim, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(img.length, 8);
    entry.writeUInt32LE(offset, 12);
    dirEntries.push(entry);
    offset += img.length;
  }

  const icoBuffer = Buffer.concat([header, ...dirEntries, ...images]);
  fs.writeFileSync('public/favicon.ico', icoBuffer);

  // SVG
  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><image href="data:image/png;base64,${buf.toString('base64')}" width="512" height="512"/></svg>`;
  fs.writeFileSync('public/favicon.svg', svgContent);

  // Webmanifest
  const manifest = {
    "name": "AAMARVA",
    "short_name": "AAMARVA",
    "icons": [
      {
        "src": "/favicon.png",
        "sizes": "512x512",
        "type": "image/png"
      },
      {
        "src": "/favicon-96x96.png",
        "sizes": "96x96",
        "type": "image/png"
      }
    ],
    "theme_color": "#000000",
    "background_color": "#000000",
    "display": "standalone"
  };
  fs.writeFileSync('public/site.webmanifest', JSON.stringify(manifest, null, 2));

  console.log('All public favicon assets verified and regenerated successfully!');
}

checkAndEnsureFavicons().catch(console.error);
