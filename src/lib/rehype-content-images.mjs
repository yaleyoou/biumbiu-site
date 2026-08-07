import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const publicRoot = path.resolve(fileURLToPath(new URL("../../public/", import.meta.url)));
const metadataCache = new Map();

const findImages = (node, images = []) => {
  if (node?.type === "element" && node.tagName === "img") images.push(node);
  for (const child of node?.children ?? []) findImages(child, images);
  return images;
};

const dimensionsFor = async (source) => {
  if (!source.startsWith("/") || source.startsWith("//")) return undefined;
  if (metadataCache.has(source)) return metadataCache.get(source);

  const promise = (async () => {
    const pathname = decodeURIComponent(source.split(/[?#]/, 1)[0]);
    const absolutePath = path.resolve(publicRoot, pathname.slice(1));
    if (!absolutePath.startsWith(`${publicRoot}${path.sep}`)) return undefined;

    try {
      const { width, height } = await sharp(absolutePath).metadata();
      return width && height ? { width, height } : undefined;
    } catch {
      return undefined;
    }
  })();

  metadataCache.set(source, promise);
  return promise;
};

export default function rehypeContentImages(_options = {}) {
  return async (tree) => {
    const images = findImages(tree);

    await Promise.all(images.map(async (image) => {
      image.properties ??= {};
      image.properties.loading = "lazy";
      image.properties.decoding = "async";

      const source = image.properties.src;
      if (typeof source !== "string") return;

      const dimensions = await dimensionsFor(source);
      if (!dimensions) return;

      image.properties.width = dimensions.width;
      image.properties.height = dimensions.height;
    }));
  };
}
