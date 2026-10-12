// Renders the SVG icons in src/icons/ into the PNG sizes Chrome needs.
// Run with `npm run icons` after editing an SVG.
import sharp from "sharp";

const sizes = [
  [16, "icon-small.svg"],
  [32, "icon-small.svg"],
  [48, "icon.svg"],
  [128, "icon.svg"],
];

for (const [size, svg] of sizes) {
  await sharp(`src/icons/${svg}`, { density: 384 })
    .resize(size, size)
    .png()
    .toFile(`src/icons/icon-${size}.png`);
  console.log(`src/icons/icon-${size}.png`);
}
