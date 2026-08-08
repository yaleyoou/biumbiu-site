import { mkdir, stat, writeFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import sharp from "sharp";

const IMAGE_DIRECTORY = resolve("public/images");
const MAX_DIMENSION = 1600;
const WEBP_QUALITY = 82;
const SUPPORTED_FORMATS = new Set(["jpeg", "png", "webp"]);

function fail(message) {
  console.error(message);
  process.exit(1);
}

function parseArguments(arguments_) {
  let source;
  let name;

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];

    if (argument === "--name") {
      name = arguments_[index + 1];
      if (!name) fail("--name requires a value.");
      index += 1;
      continue;
    }

    if (argument.startsWith("-")) fail(`Unknown option: ${argument}`);
    if (source) fail("Only one source image can be imported at a time.");
    source = argument;
  }

  if (!source) {
    fail("Usage: npm run image:add -- <source-image> [--name output-name]");
  }

  return { source, name };
}

function toSlug(value) {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

const { source, name } = parseArguments(process.argv.slice(2));
const sourcePath = resolve(source);

let sourceStats;
try {
  sourceStats = await stat(sourcePath);
} catch {
  fail(`Source image does not exist: ${sourcePath}`);
}

if (!sourceStats.isFile()) fail(`Source is not a file: ${sourcePath}`);

const requestedStem = name ? name.replace(/\.webp$/i, "") : basename(sourcePath, extname(sourcePath));
const outputStem = toSlug(requestedStem);
if (!outputStem) {
  fail("The output name must contain letters or numbers. Use --name with a lowercase English filename.");
}

const outputFilename = `${outputStem}.webp`;
const outputPath = resolve(IMAGE_DIRECTORY, outputFilename);

let metadata;
try {
  metadata = await sharp(sourcePath).metadata();
} catch (error) {
  fail(`Unable to read the source image: ${error instanceof Error ? error.message : String(error)}`);
}

if (!metadata.format || !SUPPORTED_FORMATS.has(metadata.format)) {
  fail(`Unsupported image format: ${metadata.format ?? "unknown"}. Use JPG, PNG, or WebP.`);
}

if ((metadata.pages ?? 1) > 1) {
  fail("Animated images are not supported by this command.");
}

await mkdir(IMAGE_DIRECTORY, { recursive: true });

try {
  await stat(outputPath);
  fail(`Output already exists: ${outputPath}`);
} catch (error) {
  if (error && typeof error === "object" && "code" in error && error.code !== "ENOENT") throw error;
}

let result;
try {
  result = await sharp(sourcePath)
    .rotate()
    .resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true
    })
    .webp({ quality: WEBP_QUALITY, alphaQuality: 100, effort: 5 })
    .toBuffer({ resolveWithObject: true });

  await writeFile(outputPath, result.data, { flag: "wx" });
} catch (error) {
  fail(`Unable to create the WebP image: ${error instanceof Error ? error.message : String(error)}`);
}

const publicPath = `/images/${outputFilename}`;
console.log(`Created ${publicPath}`);
console.log(`${formatBytes(sourceStats.size)} -> ${formatBytes(result.data.length)} (${result.info.width}x${result.info.height})`);
console.log(`Markdown: ![图片描述](${publicPath})`);
console.log(`Frontmatter: image: "${publicPath}"`);
