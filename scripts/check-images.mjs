import { readdir, readFile, stat } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import sharp from "sharp";

const SOURCE_DIRECTORY = resolve("src");
const IMAGE_DIRECTORY = resolve("public/images");
const TEXT_EXTENSIONS = new Set([".astro", ".css", ".html", ".js", ".json", ".md", ".mjs", ".ts"]);
const IMAGE_EXTENSIONS = new Set([".avif", ".gif", ".jpeg", ".jpg", ".png", ".svg", ".webp"]);
const LARGE_FILE_BYTES = 500 * 1024;
const UNOPTIMIZED_RASTER_BYTES = 200 * 1024;
const UNOPTIMIZED_RASTER_DIMENSION = 1600;

async function collectFiles(directory, acceptedExtensions) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(path, acceptedExtensions));
    } else if (entry.isFile() && acceptedExtensions.has(extname(entry.name).toLowerCase())) {
      files.push(path);
    }
  }

  return files;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

const sourceFiles = await collectFiles(SOURCE_DIRECTORY, TEXT_EXTENSIONS);
const imageReferences = new Map();

for (const sourceFile of sourceFiles) {
  const content = await readFile(sourceFile, "utf8");
  for (const match of content.matchAll(/\/images\/[^\s"'`)<>\]}]+/g)) {
    const reference = match[0].split(/[?#]/, 1)[0];
    const locations = imageReferences.get(reference) ?? [];
    locations.push(relative(resolve(), sourceFile));
    imageReferences.set(reference, locations);
  }
}

const errors = [];
const warnings = [];

for (const [reference, locations] of imageReferences) {
  const imagePath = resolve("public", reference.slice(1));
  try {
    const imageStats = await stat(imagePath);
    if (!imageStats.isFile()) throw new Error("not a file");
  } catch {
    errors.push(`Missing ${reference} (referenced by ${locations.join(", ")})`);
  }
}

const imageFiles = await collectFiles(IMAGE_DIRECTORY, IMAGE_EXTENSIONS);
for (const imageFile of imageFiles) {
  const imageStats = await stat(imageFile);
  const displayPath = relative(resolve(), imageFile);
  const extension = extname(imageFile).toLowerCase();

  if (imageStats.size > LARGE_FILE_BYTES) {
    warnings.push(`${displayPath} is ${formatBytes(imageStats.size)}; aim for 500 KB or less.`);
  }

  try {
    const metadata = await sharp(imageFile).metadata();
    const longestDimension = Math.max(metadata.width ?? 0, metadata.height ?? 0);
    const isLegacyRaster = extension === ".jpg" || extension === ".jpeg" || extension === ".png";
    if (isLegacyRaster && (imageStats.size > UNOPTIMIZED_RASTER_BYTES || longestDimension > UNOPTIMIZED_RASTER_DIMENSION)) {
      warnings.push(`${displayPath} may benefit from image:add (${formatBytes(imageStats.size)}, ${metadata.width}x${metadata.height}).`);
    }
  } catch (error) {
    errors.push(`Unable to read ${displayPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

for (const warning of warnings) console.warn(`Warning: ${warning}`);
for (const error of errors) console.error(`Error: ${error}`);

if (errors.length > 0) process.exit(1);
console.log(`Checked ${imageFiles.length} images and ${imageReferences.size} source references.`);
