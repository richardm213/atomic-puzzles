import { readdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const publicDir = path.resolve("public");
const homeImagePattern = /^home-puzzle-\d+\.png$/;

const filenames = (await readdir(publicDir))
  .filter((filename) => homeImagePattern.test(filename))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

await Promise.all(
  filenames.map(async (filename) => {
    const source = path.join(publicDir, filename);
    const target = path.join(publicDir, filename.replace(/\.png$/, ".webp"));

    await sharp(source)
      .webp({
        effort: 6,
        lossless: true,
      })
      .toFile(target);
  }),
);

console.log(`Optimized ${filenames.length} homepage images.`);
