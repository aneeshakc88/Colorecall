import sharp from 'sharp';
import fs from 'fs';

async function resize() {
  const input = 'public/logo transparent.png';
  if (!fs.existsSync(input)) {
    console.error("Input file not found");
    return;
  }
  await sharp(input).resize(32, 32).toFile('public/logo-favicon.png');
  await sharp(input).resize(180, 180).toFile('public/apple-touch-icon.png');
  await sharp(input).resize(192, 192).toFile('public/logo-192.png');
  await sharp(input).resize(512, 512).toFile('public/logo-512.png');
  await sharp(input).flatten({ background: { r: 255, g: 255, b: 255 } }).resize(1200, 630, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } }).toFile('public/logo-og.png');
  console.log('Images resized and replaced!');
}
resize();
