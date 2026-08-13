import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const sourceRoot = path.resolve("src");
const outputPath = path.resolve(".stylelint-raw-colors.json");
const stylesheetPattern = /\.(?:css|scss)$/;
const rawColorPattern = /#[\da-f]{3,8}\b/gi;

const findStylesheets = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return findStylesheets(entryPath);
      return stylesheetPattern.test(entry.name) ? [entryPath] : [];
    }),
  );
  return files.flat();
};

const stylesheets = await findStylesheets(sourceRoot);
const baseline = {};

for (const stylesheet of stylesheets.sort()) {
  const relativePath = path.relative(process.cwd(), stylesheet).split(path.sep).join("/");
  if (relativePath.startsWith("src/theme/")) continue;

  const source = await readFile(stylesheet, "utf8");
  const colors = [
    ...new Set((source.match(rawColorPattern) ?? []).map((color) => color.toLowerCase())),
  ];
  if (colors.length > 0) baseline[relativePath] = colors.sort();
}

await writeFile(outputPath, `${JSON.stringify(baseline, null, 2)}\n`);
